import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  HumanMessage,
  ToolMessage,
  BaseMessage,
} from '@langchain/core/messages';
import type { RunnableWithFallbacks } from '@langchain/core/runnables';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import { PromptsService } from '../prompts/prompts.service';

import { OnboardingGateway } from './onboarding.gateway';
import { DbToolsService, WaJsToolsService } from './tools';

/**
 * Type for AI model responses with tool calls
 */
interface AIResponseWithToolCalls extends BaseMessage {
  tool_calls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
}

/**
 * Service handling onboarding logic with AI conversation
 * Uses Grok (primary) with Gemini fallback via LangChain's withFallbacks
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);
  private primaryModel: ChatOpenAI | null = null;
  private fallbackModel: ChatGoogleGenerativeAI | null = null;
  private activeControllers: Map<string, AbortController> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly onboardingGateway: OnboardingGateway,
    private readonly promptsService: PromptsService,
    private readonly dbToolsService: DbToolsService,
    private readonly waJsToolsService: WaJsToolsService,
  ) {
    // Initialize models with fallback chain
    const grokApiKey = this.configService.get<string>('ai.grok.apiKey');
    const grokApiBase = this.configService.get<string>('ai.grok.apiBase');
    const grokModelName = this.configService.get<string>('ai.grok.model');
    const geminiApiKey = this.configService.get<string>('ai.gemini.apiKey');
    const geminiModelName = this.configService.get<string>('ai.gemini.model');

    // Create primary model (Grok)
    if (grokApiKey) {
      this.primaryModel = new ChatOpenAI({
        apiKey: grokApiKey,
        configuration: {
          baseURL: grokApiBase,
        },
        modelName: grokModelName,
        temperature: 0.7,
        maxRetries: 0, // Fail fast to trigger fallback
      });
      this.logger.log(`✅ Grok model initialized: ${grokModelName}`);
    }

    // Create fallback model (Gemini)
    if (geminiApiKey) {
      this.fallbackModel = new ChatGoogleGenerativeAI({
        apiKey: geminiApiKey,
        model: geminiModelName || 'gemini-2.5-pro',
        temperature: 0.7,
        maxRetries: 2,
      });
      this.logger.log(
        `✅ Gemini model initialized: ${geminiModelName || 'gemini-2.5-pro'}`,
      );
    }

    if (!this.primaryModel && !this.fallbackModel) {
      this.logger.error('❌ No AI model configured');
    }
  }

  /**
   * Cancel ongoing AI processing for a user
   * Returns the last user message content if cancelled successfully
   */
  async cancelProcessing(userId: string): Promise<string | null> {
    const controller = this.activeControllers.get(userId);
    if (controller) {
      this.logger.log(`🛑 Cancelling processing for user ${userId}`);
      controller.abort();
      this.activeControllers.delete(userId);

      // Get the last user message to restore it
      const lastMessage = await this.prisma.threadMessage.findFirst({
        where: {
          thread: { userId },
          role: 'user',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (lastMessage) {
        // Delete the last user message
        await this.prisma.threadMessage.delete({
          where: { id: lastMessage.id },
        });

        this.logger.log(
          `✅ Deleted last message and returning content for restore`,
        );
        return lastMessage.content;
      }
    }
    return null;
  }

  /**
   * Check if processing is active for a user
   */
  isProcessingActive(userId: string): boolean {
    return this.activeControllers.has(userId);
  }

  /**
   * Create thread if not exists
   */
  async createThreadIfNotExists(userId: string) {
    const existing = await this.prisma.onboardingThread.findUnique({
      where: { userId },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.onboardingThread.create({
      data: {
        userId,
        score: 0,
        status: 'in_progress',
      },
    });
  }

  /**
   * Get thread with messages for user
   */
  async getThreadWithMessages(userId: string) {
    return this.prisma.onboardingThread.findUnique({
      where: { userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  /**
   * Fetch user's business data for prompt building
   */
  private async fetchUserBusinessData(userId: string) {
    // Get business info
    const businessInfo = await this.prisma.businessInfo.findUnique({
      where: { user_id: userId },
    });

    // Get all collections with their first 5 products (including metadata)
    const collections = await this.prisma.collection.findMany({
      where: { user_id: userId },
      include: {
        products: {
          take: 5,
          where: { is_hidden: false },
          include: {
            metadata: {
              where: { is_visible: true },
              select: { key: true, value: true },
            },
          },
        },
      },
    });

    // Transform to the format expected by PromptsService
    const businessData = businessInfo
      ? {
          is_business: businessInfo.is_business,
          profile_name: businessInfo.profile_name || undefined,
          name: businessInfo.name || undefined,
          description: businessInfo.description || undefined,
          address: businessInfo.address || undefined,
          city: businessInfo.city || undefined,
          country: businessInfo.country || undefined,
          email: businessInfo.email || undefined,
          categories: businessInfo.categories as
            | { id: string; localized_display_name: string }[]
            | undefined,
          business_hours: businessInfo.business_hours as
            | {
                config?: Record<
                  string,
                  { mode: string; open_time?: string; close_time?: string }
                >;
                timezone?: string;
              }
            | undefined,
          profile_options: businessInfo.profile_options as
            | {
                commerceExperience?: string;
                cartEnabled?: boolean;
              }
            | undefined,
          phone_numbers: businessInfo.phone_numbers || undefined,
        }
      : {};

    const collectionsData = collections.map((c) => ({
      name: c.name,
      description: c.description || undefined,
      products: c.products.map((p) => ({
        name: p.name,
        description: p.description || undefined,
        price: p.price || undefined,
        currency: p.currency || undefined,
        category: p.category || undefined,
        availability: p.availability || undefined,
        max_available: p.max_available || undefined,
        is_hidden: p.is_hidden,
        metadata: p.metadata.map((m) => ({ key: m.key, value: m.value })),
      })),
    }));

    return { businessData, collectionsData };
  }

  /**
   * Perform initial evaluation after sync completed
   */
  async performInitialEvaluation(userId: string): Promise<void> {
    this.logger.log(`🤖 Starting initial AI evaluation for user: ${userId}`);

    try {
      // Create thread
      const thread = await this.createThreadIfNotExists(userId);

      // Fetch all business data
      const { businessData, collectionsData } =
        await this.fetchUserBusinessData(userId);

      // Build prompt using PromptsService
      const prompt = this.promptsService.buildInitialEvaluationPrompt(
        businessData,
        collectionsData,
      );

      // Call AI (LangChain handles fallback automatically)
      let aiResponse: string;
      try {
        if (!this.primaryModel && !this.fallbackModel) {
          throw new Error('No AI model configured');
        }
        aiResponse = await this.executeToolsLoop(userId, prompt);
      } catch (error) {
        this.logger.error('AI invocation failed', error);
        // Static fallback response
        aiResponse = JSON.stringify({
          score: 20,
          context:
            '## Informations de base récupérées\n\n- Profil WhatsApp Business connecté\n- Catalogue synchronisé',
          needs: [
            'Politique de livraison',
            'Moyens de paiement acceptés',
            'Politique de retour',
          ],
          question:
            'Proposez-vous la livraison à vos clients ? Si oui, dans quelles villes ?',
        });
      }

      // Parse AI response
      const evaluation = this.parseAIResponse(aiResponse);

      // Update thread
      await this.prisma.onboardingThread.update({
        where: { id: thread.id },
        data: {
          score: evaluation.score,
          context: evaluation.context,
          needs: evaluation.needs,
        },
      });

      // Create first message
      await this.prisma.threadMessage.create({
        data: {
          threadId: thread.id,
          role: 'assistant',
          content: evaluation.question,
          metadata: {
            score: evaluation.score,
            context: evaluation.context,
            needs: evaluation.needs,
          },
        },
      });

      // Emit AI message (includes score, no need for separate emitScoreUpdate)
      this.onboardingGateway.emitAIMessage(userId, {
        message: evaluation.question,
        score: evaluation.score,
        context: evaluation.context,
        needs: evaluation.needs,
        question: evaluation.question,
      });

      this.onboardingGateway.emitThreadReady(userId);

      this.logger.log(`✅ Initial evaluation completed for user: ${userId}`);
    } catch (error) {
      this.logger.error(`Failed initial evaluation for user: ${userId}`, error);
      throw error;
    }
  }

  /**
   * Handle user message and generate AI response
   */
  async handleUserMessage(userId: string, content: string): Promise<void> {
    this.logger.log(`💬 Handling user message for: ${userId}`);

    // Create and store AbortController for this request
    const controller = new AbortController();
    this.activeControllers.set(userId, controller);

    try {
      const thread = await this.prisma.onboardingThread.findUnique({
        where: { userId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 20, // Last 20 messages for context
          },
        },
      });

      if (!thread) {
        throw new Error('Thread not found');
      }

      // Save user message
      const newMessage = await this.prisma.threadMessage.create({
        data: {
          threadId: thread.id,
          role: 'user',
          content,
        },
      });

      thread.messages.push(newMessage);

      // Fetch all business data
      const { businessData, collectionsData } =
        await this.fetchUserBusinessData(userId);

      // Build conversation history
      const conversationHistory = thread.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Build prompt using PromptsService
      const prompt = this.promptsService.buildConversationPrompt(
        businessData,
        collectionsData,
        conversationHistory,
        thread.score,
        thread.context,
        thread.needs as string[] | null,
        content,
      );

      // Call AI (LangChain handles fallback automatically)
      let aiResponse: string;
      try {
        if (!this.primaryModel && !this.fallbackModel) {
          throw new Error('No AI model configured');
        }
        aiResponse = await this.executeToolsLoop(
          userId,
          prompt,
          controller.signal,
        );
      } catch (error) {
        // Check if this was an abort
        if (error instanceof Error && error.name === 'AbortError') {
          this.logger.log(`⏹️ Processing cancelled for user ${userId}`);
          return; // Exit without sending response
        }
        this.logger.error('AI invocation failed', error);
        aiResponse = JSON.stringify({
          score: Math.min(thread.score + 5, 100),
          context: thread.context || '',
          needs: thread.needs || [],
          question:
            "Merci pour ces informations. Pouvez-vous m'en dire plus sur vos modalités de paiement ?",
        });
      }

      const evaluation = this.parseAIResponse(aiResponse);

      // Update thread
      await this.prisma.onboardingThread.update({
        where: { id: thread.id },
        data: {
          score: evaluation.score,
          context: evaluation.context,
          needs: evaluation.needs,
        },
      });

      // Save AI response
      await this.prisma.threadMessage.create({
        data: {
          threadId: thread.id,
          role: 'assistant',
          content: evaluation.question,
          metadata: evaluation,
        },
      });

      // Emit AI message (includes score)
      this.onboardingGateway.emitAIMessage(userId, {
        message: evaluation.question,
        score: evaluation.score,
        context: evaluation.context,
        needs: evaluation.needs,
        question: evaluation.question,
      });

      // Note: Score >= 80 means the user CAN complete onboarding,
      // but they can continue to improve the context if they want.
      // The user must explicitly complete the onboarding via the UI.
    } catch (error) {
      this.logger.error(`Failed to handle user message for: ${userId}`, error);
      throw error;
    } finally {
      // Clean up the controller
      this.activeControllers.delete(userId);
    }
  }

  /**
   * Complete onboarding manually
   * User decides they're ready to activate the system
   */
  async completeOnboarding(userId: string) {
    const thread = await this.prisma.onboardingThread.findUnique({
      where: { userId },
    });

    if (!thread) {
      throw new Error('No onboarding thread found for user');
    }

    if (thread.status === 'completed') {
      return {
        message: 'Onboarding already completed',
        score: thread.score,
        warning: null,
      };
    }

    // Check score for warning
    let warning: string | null = null;
    if (thread.score < 80) {
      warning = `Le score actuel est de ${thread.score}%. Il est recommandé d'avoir au moins 80% pour une expérience optimale. Vous pouvez continuer à améliorer le contexte plus tard.`;
    }

    // Mark as completed
    await this.prisma.onboardingThread.update({
      where: { id: thread.id },
      data: { status: 'completed' },
    });

    // Activate user
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE' },
    });

    this.logger.log(
      `✅ User ${userId} completed onboarding (score: ${thread.score}%)`,
    );

    return {
      message: 'Onboarding terminé avec succès !',
      score: thread.score,
      warning,
    };
  }

  /**
   * Parse AI response with cleanup
   */
  private parseAIResponse(response: string): {
    score: number;
    context: string;
    needs: string[];
    question: string;
  } {
    try {
      const cleaned = response
        .replace(/```json\n?/g, '')
        .replace(/```/g, '')
        .trim();

      return JSON.parse(cleaned);
    } catch (error) {
      this.logger.error('Failed to parse AI response', error);
      return {
        score: 20,
        context: '',
        needs: [],
        question: 'Pouvez-vous me parler de votre politique de livraison ?',
      };
    }
  }

  /**
   * Execute the AI model with tools loop
   * Uses LangChain's tool calling capability to allow the AI to use tools autonomously
   */
  private async executeToolsLoop(
    userId: string,
    prompt: string,
    signal?: AbortSignal,
  ): Promise<string> {
    // Get tools for this user
    const tools = [
      ...this.dbToolsService.createTools(userId),
      ...this.waJsToolsService.createTools(userId),
    ];

    // Bind tools to model
    // Note: Using 'any' here due to LangChain type incompatibilities between versions
    // The runtime behavior is correct and type-safe at execution
    let modelWithTools: unknown;

    if (this.primaryModel && this.fallbackModel) {
      // Bind tools to both models and create fallback chain
      const primaryWithTools = this.primaryModel.bindTools(tools);
      const fallbackWithTools = this.fallbackModel.bindTools(tools);

      modelWithTools = primaryWithTools.withFallbacks({
        fallbacks: [fallbackWithTools as any],
      });
    } else if (this.primaryModel) {
      modelWithTools = this.primaryModel.bindTools(tools);
    } else if (this.fallbackModel) {
      modelWithTools = this.fallbackModel.bindTools(tools);
    } else {
      throw new Error('No AI model configured');
    }

    const messages: BaseMessage[] = [new HumanMessage(prompt)];

    // Emit thinking status
    this.onboardingGateway.emitThinking(userId, true);

    // Check if already aborted
    if (signal?.aborted) {
      throw new Error('AbortError');
    }

    // Invoke model with messages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let response = (await (modelWithTools as any).invoke(
      messages,
      signal ? { signal } : undefined,
    )) as AIResponseWithToolCalls;

    // Loop while there are tool calls
    // Limit to 6 iterations to prevent infinite loops
    let iterations = 0;
    const MAX_ITERATIONS = 6;

    while (response.tool_calls?.length && iterations < MAX_ITERATIONS) {
      // Check if aborted at the start of each iteration
      if (signal?.aborted) {
        const error = new Error('AbortError');
        error.name = 'AbortError';
        throw error;
      }

      this.logger.log(
        `🛠️ Executing ${response.tool_calls.length} tool calls (Iteration ${iterations + 1})`,
      );

      // Emit tool executing for each tool
      for (const toolCall of response.tool_calls) {
        this.onboardingGateway.emitToolExecuting(userId, toolCall.name);
      }

      // Add the assistant's message with tool calls to history
      messages.push(response);

      // Execute all tool calls in parallel
      const toolResults = await Promise.all(
        response.tool_calls.map(async (toolCall) => {
          const tool = tools.find((t) => t.name === toolCall.name);

          if (!tool) {
            this.logger.error(`Tool not found: ${toolCall.name}`);
            return new ToolMessage({
              tool_call_id: toolCall.id,
              content: `Error: Tool ${toolCall.name} not found`,
            });
          }

          try {
            this.logger.debug(
              `Calling tool ${toolCall.name} with args:`,
              toolCall.args,
            );
            const result = await tool.invoke(toolCall.args);
            return new ToolMessage({
              tool_call_id: toolCall.id,
              content: result,
            });
          } catch (error) {
            this.logger.error(`Tool execution failed: ${toolCall.name}`, error);
            return new ToolMessage({
              tool_call_id: toolCall.id,
              content: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`,
            });
          }
        }),
      );

      // Add tool results to history
      messages.push(...toolResults);

      // Call model again with updated history
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response = (await (modelWithTools as any).invoke(
        messages,
        signal ? { signal } : undefined,
      )) as AIResponseWithToolCalls;
      iterations++;
    }

    if (iterations >= MAX_ITERATIONS) {
      this.logger.warn(`⚠️ Max tool iterations (${MAX_ITERATIONS}) reached`);
    }

    return response.content as string;
  }
}
