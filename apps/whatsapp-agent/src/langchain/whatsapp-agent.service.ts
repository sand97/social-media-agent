import {
  CanProcessResponse,
  AuthorizedGroup,
} from '@app/backend-client/backend-api.types';
import { BackendClientService } from '@app/backend-client/backend-client.service';
import { ConnectorClientService } from '@app/connector/connector-client.service';
import { PageScriptService } from '@app/page-scripts/page-script.service';
import { RateLimitService } from '@app/security/rate-limit.service';
import { SanitizationService } from '@app/security/sanitization.service';
import { CatalogTools } from '@app/tools/catalog/catalog.tools';
import { ChatTools } from '@app/tools/chat/chat.tools';
import { CommunicationTools } from '@app/tools/communication/communication.tools';
import { GroupTools } from '@app/tools/group/group.tools';
import { IntentTools } from '@app/tools/intent/intent.tools';
import { LabelsTools } from '@app/tools/labels/labels.tools';
import { MemoryTools } from '@app/tools/memory/memory.tools';
import { MessagesTools } from '@app/tools/messages/messages.tools';
import { ToolMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createAgent,
  createMiddleware,
  modelCallLimitMiddleware,
  modelFallbackMiddleware,
  toolCallLimitMiddleware,
} from 'langchain';
import { z } from 'zod';

import { AgentOperationCallbackHandler } from './agent-operation-callback.handler';
import { SystemPromptService } from './system-prompt.service';

/**
 * Context schema for runtime agent execution
 */
const contextSchema = z.object({
  chatId: z.string(),
  contactId: z.string().optional(),
  agentId: z.string().optional(),
  managementGroupId: z.string().optional(),
  agentContext: z.string().optional(),
  authorizedGroups: z
    .array(
      z.object({
        whatsappGroupId: z.string(),
        usage: z.string(),
        name: z.string().optional(),
      }),
    )
    .optional(),
});

type AgentContext = z.infer<typeof contextSchema>;

interface ContactLabel {
  id: string;
  name: string;
  hexColor: string;
}

interface HistoryMessage {
  id: string;
  body: string;
  from: string;
  fromMe: boolean;
  timestamp: number;
  type: string;
  hasMedia: boolean;
  quotedMsg?: {
    id: string;
    body: string;
  };
}

interface MessageHistory {
  messages: HistoryMessage[];
  hostMessageCount: number;
  ourMessageCount: number;
  totalFetched: number;
  reachedLimit: boolean;
}

interface MessageData {
  id?: any; // Message ID from WhatsApp
  fromMe: boolean;
  from: string;
  body: string;
  contactId?: string; // Real contact ID (not @lid format), added by connector
  contactLabels?: ContactLabel[];
  messageHistory?: MessageHistory; // Added by connector
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
    private readonly chatTools: ChatTools,
    private readonly groupTools: GroupTools,
    private readonly labelsTools: LabelsTools,
    private readonly memoryTools: MemoryTools,
    private readonly messagesTools: MessagesTools,
    private readonly intentTools: IntentTools,
    private readonly sanitizationService: SanitizationService,
    private readonly rateLimitService: RateLimitService,
    private readonly backendClient: BackendClientService,
    private readonly connectorClient: ConnectorClientService,
    private readonly scriptService: PageScriptService,
    private readonly systemPromptService: SystemPromptService,
  ) {
    this.logger.log('🚀 Initializing WhatsApp Agent...');

    // Get model configuration
    const primaryModelType =
      this.configService.get<string>('PRIMARY_MODEL') || 'grok';
    const fallbackModelType =
      this.configService.get<string>('FALLBACK_MODEL') || 'gemini';

    this.logger.log(`📋 Model Configuration:`);
    this.logger.log(`   Primary: ${primaryModelType}`);
    this.logger.log(`   Fallback: ${fallbackModelType}`);

    // Initialize models based on configuration
    const models = this.initializeModels(primaryModelType, fallbackModelType);
    (this.primaryModel as any) = models.primary;
    (this.fallbackModel as any) = models.fallback;

    if (!this.primaryModel && !this.fallbackModel) {
      this.logger.error('❌ No AI model configured');
      return;
    }

    // Create the agent once with all tools
    const allTools = [
      ...this.communicationTools.createTools(),
      ...this.catalogTools.createTools(),
      ...this.chatTools.createTools(),
      ...this.groupTools.createTools(),
      ...this.labelsTools.createTools(),
      ...this.memoryTools.createTools(),
      ...this.messagesTools.createTools(),
      ...this.intentTools.createTools(),
    ];

    let tools = allTools;

    // Optional experiment: limit active tools to a predefined set of 5
    const experiment5ToolsEnabled =
      this.configService.get<string>('AGENT_EXPERIMENT_5_TOOLS') === 'true';
    const configuredActiveTools = this.configService.get<string>(
      'AGENT_ACTIVE_TOOLS',
    );

    let activeToolNames: Set<string> | null = null;
    if (configuredActiveTools?.trim()) {
      activeToolNames = new Set(
        configuredActiveTools
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean),
      );
    } else if (experiment5ToolsEnabled) {
      activeToolNames = new Set([
        'reply_to_message',
        'get_message_history',
        'get_contact_labels',
        'search_products',
        'send_to_admin_group',
      ]);
    }

    if (activeToolNames && activeToolNames.size > 0) {
      tools = allTools.filter((tool: any) => activeToolNames!.has(tool.name));

      const loadedToolNames = new Set(allTools.map((tool: any) => tool.name));
      const missingTools = [...activeToolNames].filter(
        (name) => !loadedToolNames.has(name),
      );

      this.logger.warn(
        `🧪 Tool filter active: ${tools.length}/${allTools.length} tools enabled`,
      );
      this.logger.warn(
        `🧪 Enabled tools: ${tools.map((tool: any) => tool.name).join(', ')}`,
      );
      if (missingTools.length > 0) {
        this.logger.warn(
          `🧪 Unknown tools in AGENT_ACTIVE_TOOLS: ${missingTools.join(', ')}`,
        );
      }
    }

    this.logger.log(`📦 Loaded ${tools.length} tools for the agent`);

    const primaryModel = this.primaryModel || this.fallbackModel;
    if (!primaryModel) {
      this.logger.error('❌ No primary model available for agent creation');
      return;
    }

    // Build middleware array
    const sideEffectTools = new Set([
      'reply_to_message',
      'send_text_message',
      'send_products',
      'send_collection',
      'send_catalog_link',
      'send_to_admin_group',
      'notify_authorized_group',
      'forward_to_management_group',
      'send_group_invite',
      'add_label_to_contact',
      'remove_label_from_contact',
      'save_persistent_memory',
      'schedule_intention',
      'cancel_intention',
    ]);

    // Single middleware to enforce "max 1 call per side-effect tool per run"
    // This avoids creating one LangGraph node per side-effect tool limiter.
    const sideEffectToolCallLimiter = createMiddleware({
      name: 'SideEffectToolCallLimiter',
      stateSchema: z.object({
        runSideEffectToolCallCount: z.record(z.string(), z.number()).default({}),
      }),
      afterModel: {
        hook: (state) => {
          const messages = Array.isArray((state as any).messages)
            ? ((state as any).messages as any[])
            : [];

          const aiMessageWithTools = [...messages]
            .reverse()
            .find(
              (message) =>
                Array.isArray(message?.tool_calls) &&
                message.tool_calls.length > 0,
            );

          if (!aiMessageWithTools) {
            return undefined;
          }

          const runCounts = {
            ...((state as any).runSideEffectToolCallCount || {}),
          } as Record<string, number>;

          const blockedToolCalls: Array<{ id?: string; name?: string }> = [];

          for (const toolCall of aiMessageWithTools.tool_calls as Array<{
            id?: string;
            name?: string;
          }>) {
            const toolName = toolCall.name;
            if (!toolName || !sideEffectTools.has(toolName)) {
              continue;
            }

            const count = runCounts[toolName] || 0;
            if (count >= 1) {
              blockedToolCalls.push(toolCall);
              continue;
            }

            runCounts[toolName] = count + 1;
          }

          if (blockedToolCalls.length === 0) {
            return {
              runSideEffectToolCallCount: runCounts,
            };
          }

          const blockedMessages = blockedToolCalls.map(
            (toolCall) =>
              new ToolMessage({
                content: `Tool call limit exceeded. Do not call '${toolCall.name || 'this tool'}' again in this run.`,
                tool_call_id: toolCall.id || '',
                name: toolCall.name || 'unknown_tool',
                status: 'error',
              }),
          );

          return {
            runSideEffectToolCallCount: runCounts,
            messages: blockedMessages,
          };
        },
      },
      afterAgent: () => ({
        runSideEffectToolCallCount: {},
      }),
    });

    const middleware = [
      // Model call limit middleware (max 6 iterations)
      modelCallLimitMiddleware({
        runLimit: 6,
        exitBehavior: 'end',
      }),
      // Global tool call limit (per run) to prevent excessive tool usage
      toolCallLimitMiddleware({
        runLimit: 6,
        exitBehavior: 'continue',
      }),
      // Prevent duplicate side-effect tool calls in a single run
      sideEffectToolCallLimiter,
      // Tool execution tracking middleware
      createMiddleware({
        name: 'ToolTracking',
        contextSchema,
        wrapModelCall: async (request, handler) => {
          const chatId = request.runtime.context?.chatId;
          const modelTurn =
            Number((request.state as any)?.runModelCallCount ?? 0) + 1;

          const response = await handler(request);

          const toolCalls = Array.isArray((response as any)?.tool_calls)
            ? ((response as any).tool_calls as Array<{ name?: string }>)
            : [];

          if (chatId && toolCalls.length > 0) {
            const toolNames = toolCalls
              .map((toolCall) => toolCall.name || 'unknown_tool')
              .join(', ');
            this.logger.debug(
              `🤖 [${chatId}] Model turn #${modelTurn} proposed tools: ${toolNames}`,
            );

            const previousAiMessageWithTools = Array.isArray(
              (request.state as any)?.messages,
            )
              ? [...(request.state as any).messages]
                  .reverse()
                  .find(
                    (message: any) =>
                      Array.isArray(message?.tool_calls) &&
                      message.tool_calls.length > 0,
                  )
              : undefined;

            if (previousAiMessageWithTools) {
              const previousToolNames = (
                previousAiMessageWithTools.tool_calls as Array<{ name?: string }>
              )
                .map((toolCall) => toolCall.name || 'unknown_tool')
                .join(', ');

              if (previousToolNames === toolNames) {
                this.logger.warn(
                  `⚠️ [${chatId}] Potential tool loop at model turn #${modelTurn}: repeated tools "${toolNames}"`,
                );
              }
            }
          }

          return response;
        },
        wrapToolCall: async (request, handler) => {
          const chatId = request.runtime.context?.chatId;
          const toolName = request.toolCall.name;
          if (chatId) {
            this.logger.log(`🛠️ [${chatId}] Executing tool: ${toolName}`);
          }
          try {
            const result: any = await handler(request);
            let preview: string;
            try {
              preview =
                typeof result === 'string'
                  ? result.substring(0, 400)
                  : JSON.stringify(result).substring(0, 400);
            } catch {
              preview = '[unserializable tool result]';
            }
            if (chatId) {
              this.logger.debug(
                `🛠️ [${chatId}] Tool result (${toolName}): ${preview}`,
              );
            }
            return result;
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
        '❌ Agent not initialized. Please configure AI model API keys',
      );
    }
  }

  /**
   * Initialize AI models based on configuration
   */
  private initializeModels(primaryType: string, fallbackType: string) {
    const primary = this.createModel(primaryType, true);
    const fallback =
      fallbackType !== 'none' ? this.createModel(fallbackType, false) : null;

    return { primary, fallback };
  }

  /**
   * Create a specific AI model instance
   */
  private createModel(
    modelType: string,
    isPrimary: boolean,
  ): ChatOpenAI | ChatGoogleGenerativeAI | null {
    const retries = isPrimary ? 0 : 2; // Primary fails fast, fallback retries

    switch (modelType.toLowerCase()) {
      case 'grok':
      case 'xai': {
        const apiKey = this.configService.get<string>('XAI_API_KEY');
        if (!apiKey) {
          this.logger.warn(`⚠️ XAI_API_KEY not configured for ${modelType}`);
          return null;
        }
        const model = new ChatOpenAI({
          openAIApiKey: apiKey,
          modelName: this.configService.get<string>('XAI_MODEL') || 'grok-beta',
          temperature: 0.7,
          maxRetries: retries,
          configuration: {
            baseURL: 'https://api.x.ai/v1',
          },
        });
        this.logger.log(
          `✅ Grok model initialized (${isPrimary ? 'primary' : 'fallback'})`,
        );
        return model;
      }

      case 'gemini': {
        const apiKey = this.configService.get<string>('GEMINI_API_KEY');
        if (!apiKey) {
          this.logger.warn(`⚠️ GEMINI_API_KEY not configured for ${modelType}`);
          return null;
        }
        const model = new ChatGoogleGenerativeAI({
          apiKey,
          model:
            this.configService.get<string>('GEMINI_MODEL') ||
            'gemini-2.0-flash-exp',
          temperature: 0.7,
          maxRetries: retries,
        });
        this.logger.log(
          `✅ Gemini model initialized (${isPrimary ? 'primary' : 'fallback'})`,
        );
        return model;
      }

      case 'openai':
      case 'gpt': {
        const apiKey = this.configService.get<string>('OPENAI_API_KEY');
        if (!apiKey) {
          this.logger.warn(`⚠️ OPENAI_API_KEY not configured for ${modelType}`);
          return null;
        }
        const model = new ChatOpenAI({
          openAIApiKey: apiKey,
          modelName: this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o',
          temperature: 0.7,
          maxRetries: retries,
        });
        this.logger.log(
          `✅ OpenAI model initialized (${isPrimary ? 'primary' : 'fallback'})`,
        );
        return model;
      }

      default:
        this.logger.warn(`⚠️ Unknown model type: ${modelType}`);
        return null;
    }
  }

  /**
   * Process an incoming WhatsApp message
   */
  async processIncomingMessage(
    messageData: MessageData[],
    userId?: string,
  ): Promise<void> {
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

      // Prefer transcript if present (audio), otherwise body
      const userMessage =
        message?.body ||
        (message as any)?.transcript ||
        (message as any)?.metadata?.transcript ||
        '';
      const messageId = message?.id?._serialized || message?.id || '';
      // chatId is the conversation ID (contact or group)
      // contactId is the real contact ID (not @lid), added by connector
      // For individual chats: "33765538022@c.us"
      // For group chats: "123456@g.us"
      const chatId = message?.from || '';
      const contactId = message?.contactId || '';

      // Log what the agent receives
      this.logger.log(
        `📥 [AGENT] Received message from ${chatId}, messageId: ${messageId}, messageHistory attached: ${!!message.messageHistory}`,
      );
      if (message.messageHistory) {
        this.logger.log(
          `📦 [AGENT] messageHistory contains ${message.messageHistory.messages?.length || 0} messages`,
        );
      } else {
        this.logger.warn(`⚠️ [AGENT] No messageHistory in received message!`);
      }

      // Fetch metadata (e.g., transcripts) for history + current message
      const historyIds =
        message.messageHistory?.messages?.map((m) => m.id).filter(Boolean) ||
        [];
      const idsToFetch = [...historyIds, messageId].filter(Boolean);
      let metadataMap: Record<string, any[]> | undefined;

      if (idsToFetch.length > 0) {
        try {
          const metadataRes = await this.backendClient.fetchMetadataList({
            messageIds: idsToFetch,
          });
          metadataMap = metadataRes.data;
          (message as any).metadataMap = metadataMap;

          // Attach metadata to messageHistory messages for easier use later
          message.messageHistory?.messages?.forEach((m) => {
            if (m.id && metadataMap?.[m.id]) {
              (m as any).metadata = metadataMap[m.id];
            }
          });
        } catch (error: any) {
          this.logger.warn(
            `Failed to fetch metadata list: ${error.message || error}`,
          );
        }
      }

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

      // Check with backend first using userId (connected WhatsApp account ID) instead of chatId
      // userId format: "237657888690@c.us" (the phone number of the WhatsApp account owner)
      if (!userId) {
        this.logger.error(
          'userId not provided in webhook, cannot identify user',
        );
        return;
      }

      const canProcess = await this.checkCanProcess(
        userId,
        chatId,
        sanitized,
        message.contactLabels,
      );

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

      const systemPrompt = this.systemPromptService.buildSystemPrompt(
        canProcess.agentContext || '',
        groupUsage,
        canProcess.authorizedGroups,
      );

      // Build conversation history from message history
      const conversationHistory = this.buildConversationHistory(
        message.messageHistory,
        messageId,
      );

      this.logger.log(
        `🔄 [AGENT] Built conversation history: ${conversationHistory.length} messages`,
      );

      // Log conversation before sending to agent
      this.logConversation(conversationHistory, sanitized);

      const { metrics } = await this.invokeAgent(
        chatId,
        sanitized,
        systemPrompt,
        conversationHistory,
        {
          contactId,
          agentId: canProcess.agentId,
          managementGroupId: canProcess.managementGroupId,
          agentContext: canProcess.agentContext,
          authorizedGroups: canProcess.authorizedGroups,
        },
      );

      this.logger.log(
        `✅ Message processed for ${chatId} in ${metrics.durationMs}ms | Tokens: ${metrics.totalTokens || 'N/A'} | Tools: ${metrics.toolsUsed.length}`,
      );

      // Log to backend with full metrics
      await this.logToBackend(metrics);
    } catch (error: any) {
      this.logger.error('Error processing incoming message:', error.message);
      throw error;
    }
  }

  /**
   * Check with backend if we should process this message
   * @param userId - The connected WhatsApp account ID (e.g., "237657888690@c.us")
   * @param chatId - The chat ID where the message was received
   * @param message - The message content
   * @param contactLabels - Labels of the contact sending the message
   */
  private async checkCanProcess(
    userId: string,
    chatId: string,
    message: string,
    contactLabels?: ContactLabel[],
  ): Promise<CanProcessResponse> {
    return this.backendClient.canProcess(
      userId,
      chatId,
      message,
      contactLabels,
    );
  }

  /**
   * Log conversation in a simple, readable format
   */
  private logConversation(
    conversationHistory: Array<{ role: string; content: string }>,
    currentMessage: string,
  ): void {
    this.logger.log('\n=== 💬 CONVERSATION ===');

    // Log history
    conversationHistory.forEach((msg) => {
      const sender = msg.role === 'assistant' ? 'ME' : 'CONTACT';
      const preview = msg.content.substring(0, 100);
      this.logger.log(
        `${sender}: ${preview}${msg.content.length > 100 ? '...' : ''}`,
      );
    });

    // Log current message
    this.logger.log(`CONTACT: ${currentMessage || '[Message sans texte]'}`);
    this.logger.log('======================\n');
  }

  /**
   * Build conversation history from message history
   * Converts WhatsApp messages to LangChain message format
   */
  private buildConversationHistory(
    messageHistory?: MessageHistory,
    currentMessageId?: string,
  ): Array<{ role: string; content: string }> {
    if (!messageHistory || messageHistory.messages.length === 0) {
      return [];
    }

    // Sort messages by timestamp (oldest first) to maintain chronological order
    const sortedMessages = [...messageHistory.messages].sort(
      (a, b) => a.timestamp - b.timestamp,
    );

    // Convert to LangChain message format
    const seenIds = new Set<string>();
    const history = sortedMessages
      .filter((msg) => {
        const msgId = msg.id || '';
        if (currentMessageId && msgId && msgId === currentMessageId) {
          return false;
        }
        if (msgId) {
          if (seenIds.has(msgId)) {
            return false;
          }
          seenIds.add(msgId);
        }
        return true;
      })
      .map((msg) => {
        const records = (msg as any).metadata as any[];
        const audioMeta = records?.find((r) => r.type === 'AUDIO');
        const transcript = audioMeta?.metadata?.transcript;

        return {
          role: msg.fromMe ? 'assistant' : 'user',
          content: transcript || msg.body || '[Message sans texte]',
        };
      });

    return history;
  }

  /**
   * Invoke the agent with runtime context and metrics capture
   */
  private async invokeAgent(
    chatId: string,
    message: string,
    systemPrompt: string,
    conversationHistory: Array<{ role: string; content: string }>,
    context: {
      contactId?: string;
      agentId?: string;
      managementGroupId?: string;
      agentContext?: string;
      authorizedGroups?: AuthorizedGroup[];
    },
  ): Promise<{
    response: string;
    metrics: import('./agent-operation-callback.handler').AgentOperationMetrics;
  }> {
    if (!this.agent) {
      throw new Error('Agent not initialized');
    }

    const runtimeContext: AgentContext = {
      chatId,
      contactId: context.contactId,
      agentId: context.agentId,
      managementGroupId: context.managementGroupId,
      agentContext: context.agentContext,
      authorizedGroups: context.authorizedGroups,
    };

    // Create callback handler to capture metrics
    const callbackHandler = new AgentOperationCallbackHandler(
      chatId,
      message,
      systemPrompt,
      context.agentId,
    );

    try {
      // Build messages array with system prompt, conversation history, and current message
      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: message },
      ];

      this.logger.debug(
        `Invoking agent with ${messages.length} messages (${conversationHistory.length} from history)`,
      );

      const invokeConfig: any = {
        context: runtimeContext,
        callbacks: [callbackHandler],
      };

      const recursionLimitRaw = this.configService.get<string>(
        'AGENT_RECURSION_LIMIT',
      );
      const recursionLimit = recursionLimitRaw
        ? Number(recursionLimitRaw)
        : NaN;
      if (Number.isFinite(recursionLimit) && recursionLimit > 0) {
        invokeConfig.recursionLimit = recursionLimit;
        this.logger.debug(`Using recursionLimit=${recursionLimit}`);
      }

      const result = await this.agent.invoke(
        {
          messages,
        },
        invokeConfig,
      );

      const lastMessage = result.messages[result.messages.length - 1];
      const responseContent =
        typeof lastMessage.content === 'string'
          ? lastMessage.content
          : String(lastMessage.content);

      const sanitizedResponse =
        this.sanitizationService.sanitizeAgentResponse(responseContent);

      // Update metrics with final response
      callbackHandler.metrics.agentResponse = sanitizedResponse;

      // Log agent response (simple)
      this.logger.log(`\n📤 RESPONSE: ${sanitizedResponse}\n`);

      return {
        response: sanitizedResponse,
        metrics: callbackHandler.getMetrics(),
      };
    } catch (error: any) {
      this.logger.error('Agent invocation failed:', error.message);

      // Capture error in metrics
      callbackHandler.metrics.status = 'error';
      callbackHandler.metrics.error = error.message;
      callbackHandler.metrics.agentResponse = '';

      return {
        response: '',
        metrics: callbackHandler.getMetrics(),
      };
    }
  }

  /**
   * Log operation to backend with full metrics
   */
  private async logToBackend(
    metrics: import('./agent-operation-callback.handler').AgentOperationMetrics,
  ): Promise<void> {
    try {
      const result = await this.backendClient.logOperation({
        chatId: metrics.chatId,
        agentId: metrics.agentId,
        userId: metrics.userId,
        userMessage: metrics.userMessage,
        agentResponse: metrics.agentResponse,
        systemPrompt: metrics.systemPrompt,
        totalTokens: metrics.totalTokens,
        promptTokens: metrics.promptTokens,
        completionTokens: metrics.completionTokens,
        durationMs: metrics.durationMs || 0,
        modelName: metrics.modelName,
        toolsUsed: metrics.toolsUsed.map((tool) => ({
          name: tool.name,
          args: tool.args,
          result: tool.result,
          error: tool.error,
          durationMs: tool.durationMs,
        })),
        status: metrics.status,
        error: metrics.error,
        metadata: {},
      });

      if (result.success) {
        this.logger.debug(
          `Logged operation ${result.operationId} for ${metrics.chatId} to backend`,
        );
      }
    } catch (error: any) {
      this.logger.error('Error logging to backend:', error.message);
    }
  }
}
