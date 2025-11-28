import {
  CanProcessResponse,
  AuthorizedGroup,
} from '@app/backend-client/backend-api.types';
import { BackendClientService } from '@app/backend-client/backend-client.service';
import { RateLimitService } from '@app/security/rate-limit.service';
import { SanitizationService } from '@app/security/sanitization.service';
import { CatalogTools } from '@app/tools/catalog/catalog.tools';
import { CommunicationTools } from '@app/tools/communication/communication.tools';
import { IntentTools } from '@app/tools/intent/intent.tools';
import { LabelsTools } from '@app/tools/labels/labels.tools';
import { MemoryTools } from '@app/tools/memory/memory.tools';
import { MessagesTools } from '@app/tools/messages/messages.tools';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createAgent,
  createMiddleware,
  modelCallLimitMiddleware,
  modelFallbackMiddleware,
} from 'langchain';
import { z } from 'zod';

/**
 * Context schema for runtime agent execution
 */
const contextSchema = z.object({
  chatId: z.string(),
  agentId: z.string().optional(),
  managementGroupId: z.string().optional(),
  agentContext: z.string().optional(),
});

type AgentContext = z.infer<typeof contextSchema>;

interface MessageData {
  fromMe: boolean;
  from: string;
  body: string;
}

/**
 * Main WhatsApp Agent service using LangChain createAgent
 * Handles incoming messages and generates intelligent responses
 *
 * Architecture:
 * - Grok (primary) + Gemini (fallback) for AI responses
 * - 17+ LangChain tools for actions
 * - Rate limiting + sanitization for security
 * - Backend integration for business logic
 * - Agent created once and reuses tools, with chatId passed via runtime context
 */
@Injectable()
export class WhatsAppAgentService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppAgentService.name);
  private readonly primaryModel: ChatOpenAI | null = null;
  private readonly fallbackModel: ChatGoogleGenerativeAI | null = null;
  private readonly agent: ReturnType<typeof createAgent> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly communicationTools: CommunicationTools,
    private readonly catalogTools: CatalogTools,
    private readonly labelsTools: LabelsTools,
    private readonly memoryTools: MemoryTools,
    private readonly messagesTools: MessagesTools,
    private readonly intentTools: IntentTools,
    private readonly sanitizationService: SanitizationService,
    private readonly rateLimitService: RateLimitService,
    private readonly backendClient: BackendClientService,
  ) {
    this.logger.log('🚀 Initializing WhatsApp Agent...');

    // Initialize models
    const grokApiKey = this.configService.get<string>('GROK_API_KEY');
    if (grokApiKey) {
      this.primaryModel = new ChatOpenAI({
        openAIApiKey: grokApiKey,
        modelName: this.configService.get<string>('GROK_MODEL') || 'grok-beta',
        temperature: 0.7,
        maxRetries: 0, // Fail fast to trigger fallback
        configuration: {
          baseURL:
            this.configService.get<string>('GROK_API_BASE') ||
            'https://api.x.ai/v1',
        },
      });
      this.logger.log('✅ Grok model initialized');
    }

    const geminiApiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (geminiApiKey) {
      this.fallbackModel = new ChatGoogleGenerativeAI({
        apiKey: geminiApiKey,
        model:
          this.configService.get<string>('GEMINI_MODEL') ||
          'gemini-2.0-flash-exp',
        temperature: 0.7,
        maxRetries: 2,
      });
      this.logger.log('✅ Gemini model initialized');
    }

    if (!this.primaryModel && !this.fallbackModel) {
      this.logger.error('❌ No AI model configured');
      return;
    }

    // Create the agent once with all tools
    const tools = [
      ...this.communicationTools.createTools(),
      ...this.catalogTools.createTools(),
      ...this.labelsTools.createTools(),
      ...this.memoryTools.createTools(),
      ...this.messagesTools.createTools(),
      ...this.intentTools.createTools(),
    ];

    this.logger.log(`📦 Loaded ${tools.length} tools for the agent`);

    const primaryModel = this.primaryModel || this.fallbackModel;
    if (!primaryModel) {
      this.logger.error('❌ No primary model available for agent creation');
      return;
    }

    // Build middleware array
    const middleware = [
      // Model call limit middleware (max 6 iterations)
      modelCallLimitMiddleware({
        runLimit: 6,
        exitBehavior: 'end',
      }),
      // Tool execution tracking middleware
      createMiddleware({
        name: 'ToolTracking',
        contextSchema,
        wrapToolCall: async (request, handler) => {
          const chatId = request.runtime.context?.chatId;
          if (chatId) {
            this.logger.log(
              `🛠️ [${chatId}] Executing tool: ${request.toolCall.name}`,
            );
          }
          try {
            return await handler(request);
          } catch (error: any) {
            this.logger.error(
              `Tool execution failed: ${request.toolCall.name}`,
              error.message,
            );
            throw error;
          }
        },
      }),
    ];

    // Add fallback middleware if we have both models
    if (this.primaryModel && this.fallbackModel) {
      middleware.unshift(modelFallbackMiddleware(this.fallbackModel));
      this.logger.log('✅ Model fallback enabled (Grok → Gemini)');
    }

    // Create the agent once
    this.agent = createAgent({
      model: primaryModel,
      tools,
      middleware,
      contextSchema,
    }) as ReturnType<typeof createAgent>;

    this.logger.log('✅ WhatsApp Agent created successfully with all tools');
  }

  async onModuleInit() {
    if (!this.agent) {
      this.logger.error(
        '❌ Agent not initialized. Please configure GROK_API_KEY or GEMINI_API_KEY',
      );
    }
  }

  /**
   * Process an incoming WhatsApp message
   */
  async processIncomingMessage(messageData: MessageData[]): Promise<void> {
    if (!this.agent) {
      this.logger.error('Cannot process message: Agent not initialized');
      return;
    }

    try {
      const [message] = messageData;

      if (message?.fromMe) {
        this.logger.debug('Ignoring message from self');
        return;
      }

      const userMessage = message?.body || '';
      const chatId = message?.from || '';

      const sanitized = this.sanitizationService.sanitizeUserInput(userMessage);

      const validation = this.sanitizationService.validateInput(sanitized);
      if (!validation.valid) {
        this.logger.warn(`Invalid input from ${chatId}: ${validation.reason}`);
        return;
      }

      const rateLimit = await this.rateLimitService.checkRateLimit(chatId);
      if (rateLimit.limited) {
        this.logger.warn(`Rate limit exceeded for ${chatId}`);
        return;
      }

      this.logger.log(
        `💬 Processing message from ${chatId}: ${sanitized.substring(0, 50)}...`,
      );

      // Check with backend first (returns authorized groups)
      const canProcess = await this.checkCanProcess(chatId, sanitized);

      if (!canProcess.allowed) {
        this.logger.log(
          `❌ Cannot process message from ${chatId}: ${canProcess.reason}`,
        );
        return;
      }

      // Handle group messages
      const isGroupMessage = chatId.includes('@g.us');
      let groupUsage: string | undefined;

      if (isGroupMessage) {
        // Check if this group is authorized
        const authorizedGroup = canProcess.authorizedGroups?.find(
          (g) => g.whatsappGroupId === chatId,
        );

        if (!authorizedGroup) {
          this.logger.debug(
            `Ignoring message from unauthorized group: ${chatId}`,
          );
          return;
        }

        // Group is authorized, use its usage context
        groupUsage = authorizedGroup.usage;
        this.logger.log(
          `📨 Group message from authorized group: ${groupUsage}`,
        );
      }

      const systemPrompt = this.buildSystemPrompt(
        canProcess.agentContext || '',
        groupUsage,
        canProcess.authorizedGroups,
      );

      const response = await this.invokeAgent(chatId, sanitized, systemPrompt, {
        agentId: canProcess.agentId,
        managementGroupId: canProcess.managementGroupId,
        agentContext: canProcess.agentContext,
      });

      this.logger.log(`✅ Message processed for ${chatId}`);

      await this.logToBackend(chatId, userMessage, response);
    } catch (error: any) {
      this.logger.error('Error processing incoming message:', error.message);
      throw error;
    }
  }

  /**
   * Check with backend if we should process this message
   */
  private async checkCanProcess(
    chatId: string,
    message: string,
  ): Promise<CanProcessResponse> {
    return this.backendClient.canProcess(chatId, message);
  }

  /**
   * Build system prompt with agent context, group context, and authorized groups list
   */
  private buildSystemPrompt(
    agentContext: string,
    groupUsage?: string,
    authorizedGroups?: AuthorizedGroup[],
  ): string {
    // Group-specific context
    const groupContext = groupUsage
      ? `\n\n## 📍 Contexte du groupe actuel:\nCe message provient d'un groupe WhatsApp dédié à: **${groupUsage}**.\nAdaptez vos réponses et votre ton en fonction de ce contexte spécifique.\n`
      : '';

    // Authorized groups list
    const groupsList =
      authorizedGroups && authorizedGroups.length > 0
        ? `\n\n## 🔗 Groupes autorisés:\nVous avez accès aux groupes WhatsApp suivants, chacun avec un usage spécifique:\n${authorizedGroups
            .map(
              (g, idx) =>
                `${idx + 1}. **${g.usage}** (ID: ${g.whatsappGroupId})`,
            )
            .join(
              '\n',
            )}\n\nUtilisez l'outil \`forward_to_management_group\` pour transférer des conversations vers le groupe de gestion si nécessaire.\n`
        : '';

    return `${agentContext}${groupContext}${groupsList}

## 📋 Règles de comportement:
1. **Concision**: Répondez de manière concise (max 500 caractères par message). Si nécessaire, divisez en plusieurs messages.
2. **Proactivité**: Utilisez les outils disponibles de manière proactive pour aider le client.
3. **Professionnalisme**: Soyez toujours poli, professionnel et orienté solution.
4. **Transfert**: Si vous ne pouvez pas aider ou si la situation l'exige, transférez vers un groupe de gestion.
5. **Langue**: Répondez toujours dans la langue de l'utilisateur.

💡 **Stratégie**: Soyez orienté action et apportez une valeur ajoutée à chaque interaction.`;
  }

  /**
   * Invoke the agent with runtime context
   */
  private async invokeAgent(
    chatId: string,
    message: string,
    systemPrompt: string,
    context: {
      agentId?: string;
      managementGroupId?: string;
      agentContext?: string;
    },
  ): Promise<string> {
    if (!this.agent) {
      throw new Error('Agent not initialized');
    }

    const runtimeContext: AgentContext = {
      chatId,
      agentId: context.agentId,
      managementGroupId: context.managementGroupId,
      agentContext: context.agentContext,
    };

    try {
      const result = await this.agent.invoke(
        {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message },
          ],
        },
        {
          context: runtimeContext,
        },
      );

      const lastMessage = result.messages[result.messages.length - 1];
      const responseContent =
        typeof lastMessage.content === 'string'
          ? lastMessage.content
          : String(lastMessage.content);

      return this.sanitizationService.sanitizeAgentResponse(responseContent);
    } catch (error: any) {
      this.logger.error('Agent invocation failed:', error.message);
      throw error;
    }
  }

  /**
   * Log conversation to backend for analytics and monitoring
   */
  private async logToBackend(
    chatId: string,
    userMessage: string,
    agentResponse: string,
  ): Promise<void> {
    try {
      const result = await this.backendClient.logOperation(
        chatId,
        userMessage,
        agentResponse,
      );

      if (result.success) {
        this.logger.debug(`Logged conversation for ${chatId} to backend`);
      }
    } catch (error: any) {
      this.logger.error('Error logging to backend:', error.message);
    }
  }
}
