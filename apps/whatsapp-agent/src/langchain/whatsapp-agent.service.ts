import {
  CanProcessResponse,
  AuthorizedGroup,
} from '@app/backend-client/backend-api.types';
import { BackendClientService } from '@app/backend-client/backend-client.service';
import { ConnectorClientService } from '@app/connector/connector-client.service';
import { MessageMetadataService } from '@app/message-metadata/message-metadata.service';
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
  body?: string;
  from: string;
  fromMe: boolean;
  timestamp: number;
  type: string;
  hasMedia: boolean;
  metadata?: any[];
  quotedStanzaID?: string;
  quotedMsg?: {
    id?: string;
    body?: string;
    type?: string;
    fromMe?: boolean;
    from?: string;
    hasMedia?: boolean;
    metadata?: any[];
    // Product message fields for quoted messages
    productId?: string;
    title?: string;
    description?: string;
  };
  // Product message fields
  productId?: string;
  title?: string;
  description?: string;
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
  type?: string;
  hasMedia?: boolean;
  mediaKind?: string;
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
    private readonly messageMetadata: MessageMetadataService,
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
    const configuredActiveTools =
      this.configService.get<string>('AGENT_ACTIVE_TOOLS');

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

    const modelRunLimitRaw = this.configService.get<string>(
      'AGENT_MODEL_CALL_LIMIT',
    );
    const modelRunLimit = modelRunLimitRaw ? Number(modelRunLimitRaw) : 6;
    const safeModelRunLimit =
      Number.isFinite(modelRunLimit) && modelRunLimit > 0 ? modelRunLimit : 6;

    // Build middleware array
    const middleware = [
      // Keep a strict model-turn budget to cap cost in pathological loops.
      modelCallLimitMiddleware({
        runLimit: safeModelRunLimit,
        exitBehavior: 'end',
      }),
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

          if (chatId) {
            if (toolCalls.length > 0) {
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
                  previousAiMessageWithTools.tool_calls as Array<{
                    name?: string;
                  }>
                )
                  .map((toolCall) => toolCall.name || 'unknown_tool')
                  .join(', ');

                if (previousToolNames === toolNames) {
                  this.logger.warn(
                    `⚠️ [${chatId}] Potential tool loop at model turn #${modelTurn}: repeated tools "${toolNames}"`,
                  );
                }
              }
            } else {
              this.logger.debug(
                `🤖 [${chatId}] Model turn #${modelTurn} proposed no tools`,
              );
            }
          }

          return response;
        },
        wrapToolCall: async (request, handler) => {
          const chatId = request.runtime.context?.chatId;
          const toolName = request.toolCall.name;

          // Anti-spam guard without graph-level routing side effects:
          // block any second reply_to_message execution in the same run.
          if (toolName === 'reply_to_message') {
            const previousReplyCount = Array.isArray(
              (request.state as any)?.messages,
            )
              ? ((request.state as any).messages as any[]).filter(
                  (message) =>
                    ToolMessage.isInstance(message) &&
                    message.name === 'reply_to_message' &&
                    message.status !== 'error',
                ).length
              : 0;

            if (previousReplyCount >= 1) {
              if (chatId) {
                this.logger.warn(
                  `⚠️ [${chatId}] Blocking duplicate reply_to_message in same run`,
                );
              }
              return new ToolMessage({
                content:
                  "Tool call limit exceeded. Do not call 'reply_to_message' again in this run.",
                tool_call_id: request.toolCall.id || '',
                name: 'reply_to_message',
                status: 'error',
              });
            }
          }

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
      const rawUserMessage =
        message?.body ||
        (message as any)?.transcript ||
        (message as any)?.metadata?.transcript ||
        '';
      const messageId = this.extractMessageId(message) || '';
      // chatId is the conversation ID (contact or group)
      // contactId is the real contact ID (not @lid), added by connector
      // For individual chats: "33765538022@c.us"
      // For group chats: "123456@g.us"
      const chatId = message?.from || '';
      const contactId = message?.contactId || '';
      const analyticsMetadata = this.buildAnalyticsMetadata(
        message as MessageData,
        {
          chatId,
          contactId,
          messageId,
          ownerWhatsappId: userId,
        },
      );

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

      // Fetch metadata (e.g., transcripts, image match info) for history + current + quoted
      const historyIds =
        message.messageHistory?.messages
          ?.map((m) => this.extractMessageId(m))
          .filter(Boolean) || [];
      const historyQuotedIds =
        message.messageHistory?.messages
          ?.map((m) => {
            const quoted = this.extractQuotedMessage(m);
            return this.extractMessageId(quoted) || this.extractQuotedStanzaId(m);
          })
          .filter(Boolean) || [];
      const currentQuoted = this.extractQuotedMessage(message as any);
      const currentQuotedId =
        this.extractMessageId(currentQuoted) ||
        this.extractQuotedStanzaId(message as any) ||
        '';

      const idsToFetch = Array.from(
        new Set([...historyIds, ...historyQuotedIds, messageId, currentQuotedId]),
      ).filter((id): id is string => Boolean(id));
      let metadataMap: Record<string, any[]> | undefined;

      if (idsToFetch.length > 0) {
        try {
          metadataMap = await this.messageMetadata.getByMessageIds(idsToFetch);
          (message as any).metadataMap = metadataMap;

          // Attach metadata to messageHistory messages and quoted messages for easier use later
          message.messageHistory?.messages?.forEach((m) => {
            const mid = this.extractMessageId(m);
            if (mid && metadataMap?.[mid]) {
              (m as any).metadata = metadataMap[mid];
            }

            const quoted = this.extractQuotedMessage(m);
            const quotedId =
              this.extractMessageId(quoted) || this.extractQuotedStanzaId(m);
            if (quoted && quotedId && metadataMap?.[quotedId]) {
              (quoted as any).metadata = metadataMap[quotedId];
              if (!quoted.id) {
                quoted.id = quotedId;
              }
              if (!(m as any).quotedMsg) {
                (m as any).quotedMsg = quoted;
              }
            }
          });

          if (messageId && metadataMap?.[messageId]) {
            (message as any).metadata = metadataMap[messageId];
          }

          if (currentQuoted && currentQuotedId) {
            if (metadataMap?.[currentQuotedId]) {
              currentQuoted.metadata = metadataMap[currentQuotedId];
            }
            if (!currentQuoted.id) {
              currentQuoted.id = currentQuotedId;
            }
            if (!(message as any).quotedMsg) {
              (message as any).quotedMsg = currentQuoted;
            }
          }
        } catch (error: any) {
          this.logger.warn(
            `Failed to fetch local metadata list: ${error.message || error}`,
          );
        }
      }

      const historyContextMessageIds = this.buildHistoryContextMessageIds(
        message.messageHistory,
        messageId,
      );
      const messageForAgentRaw = this.attachMessageIdToContext(
        message as any,
        this.formatMessageForContext(
          message as any,
          true,
          historyContextMessageIds,
        ),
      );
      const sanitizedForPolicy =
        this.sanitizationService.sanitizeUserInput(rawUserMessage);
      const sanitizedForAgent = this.sanitizationService.sanitizeUserInput(
        messageForAgentRaw || rawUserMessage || '[Message sans texte]',
      );

      const validation =
        this.sanitizationService.validateInput(sanitizedForAgent);
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
        `💬 Processing message from ${chatId}: ${sanitizedForAgent.substring(0, 50)}...`,
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
        sanitizedForPolicy || sanitizedForAgent,
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

      if (!isGroupMessage && contactId) {
        void this.syncGoogleContactInBackground({
          chatId,
          contactId,
        });
      }

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
        message.contactLabels,
      );

      // Build conversation history from message history
      const conversationHistory = this.buildConversationHistory(
        message.messageHistory,
        messageId,
        historyContextMessageIds,
      );

      this.logger.log(
        `🔄 [AGENT] Built conversation history: ${conversationHistory.length} messages`,
      );

      // Log conversation before sending to agent
      this.logConversation(conversationHistory, sanitizedForAgent);

      const { metrics } = await this.invokeAgent(
        chatId,
        sanitizedForAgent,
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
      await this.logToBackend(metrics, analyticsMetadata);
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

  private async syncGoogleContactInBackground(input: {
    chatId: string;
    contactId: string;
  }): Promise<void> {
    try {
      const contact = await this.connectorClient.getContactById(input.contactId);
      const normalizedPhoneNumber = this.normalizeGoogleSyncPhoneNumber(
        contact?.number || input.contactId || input.chatId,
      );

      if (!normalizedPhoneNumber) {
        this.logger.debug(
          `Skipping Google contact sync for ${input.contactId}: missing phone number`,
        );
        return;
      }

      const response = await this.backendClient.syncGoogleContact({
        phoneNumber: normalizedPhoneNumber,
        whatsappChatId: input.chatId,
        whatsappContactId: input.contactId,
        displayName: contact?.name || contact?.pushname || undefined,
        whatsappPushName: contact?.pushname || undefined,
      });

      if (!response.success && !response.skipped) {
        this.logger.warn(
          `Google contact sync failed for ${input.contactId}: ${response.reason || 'unknown error'}`,
        );
      }
    } catch (error: any) {
      this.logger.warn(
        `Best-effort Google contact sync failed for ${input.contactId}: ${error.message || error}`,
      );
    }
  }

  private normalizeGoogleSyncPhoneNumber(value?: string): string {
    const digits = String(value || '').replace(/\D/g, '');
    return digits ? `+${digits}` : '';
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

      // Check if content looks like base64 (starts with /9j/ which is JPEG base64)
      const isBase64 =
        msg.content.startsWith('/9j/') || msg.content.startsWith('data:image');

      let preview: string;
      if (isBase64) {
        preview = '[Image base64]';
      } else {
        preview = msg.content.substring(0, 100);
      }

      this.logger.log(
        `${sender}: ${preview}${!isBase64 && msg.content.length > 100 ? '...' : ''}`,
      );
    });

    // Log current message
    this.logger.log(`CONTACT: ${currentMessage || '[Message sans texte]'}`);
    this.logger.log('======================\n');
  }

  private extractMessageId(messageLike: any): string | undefined {
    if (!messageLike) {
      return undefined;
    }

    const id = messageLike?.id?._serialized || messageLike?.id;
    if (!id) {
      return undefined;
    }

    return String(id);
  }

  private extractQuotedMessage(messageLike: any): any | undefined {
    if (!messageLike) {
      return undefined;
    }

    return messageLike.quotedMsg;
  }

  private extractQuotedStanzaId(messageLike: any): string | undefined {
    if (!messageLike) {
      return undefined;
    }

    const stanzaId = messageLike.quotedStanzaID;

    if (!stanzaId) {
      return undefined;
    }

    return String(stanzaId);
  }

  private extractMessageIdVariants(rawId?: string): string[] {
    if (!rawId) {
      return [];
    }

    const normalized = String(rawId).trim();
    if (!normalized) {
      return [];
    }

    const variants = new Set<string>([normalized]);
    const lastSegment = normalized.split('_').pop()?.trim();
    if (lastSegment) {
      variants.add(lastSegment);
    }

    return [...variants];
  }

  private addMessageIdVariants(target: Set<string>, rawId?: string): void {
    this.extractMessageIdVariants(rawId).forEach((variant) =>
      target.add(variant),
    );
  }

  private buildHistoryContextMessageIds(
    messageHistory?: MessageHistory,
    currentMessageId?: string,
  ): Set<string> {
    const historyMessageIds = new Set<string>();

    if (!messageHistory?.messages?.length) {
      return historyMessageIds;
    }

    messageHistory.messages.forEach((message) => {
      const messageId = this.extractMessageId(message);
      if (messageId && currentMessageId && messageId === currentMessageId) {
        return;
      }

      this.addMessageIdVariants(historyMessageIds, messageId);
    });

    return historyMessageIds;
  }

  private isQuotedMessageAlreadyInHistory(
    messageLike: any,
    historyMessageIds?: Set<string>,
  ): boolean {
    if (!historyMessageIds || historyMessageIds.size === 0) {
      return false;
    }

    const quotedMessage = this.extractQuotedMessage(messageLike);
    const quotedMessageId = this.extractMessageId(quotedMessage);
    const quotedStanzaId = this.extractQuotedStanzaId(messageLike);

    const quotedVariants = new Set<string>([
      ...this.extractMessageIdVariants(quotedMessageId),
      ...this.extractMessageIdVariants(quotedStanzaId),
    ]);

    for (const variant of quotedVariants) {
      if (historyMessageIds.has(variant)) {
        return true;
      }
    }

    return false;
  }

  private normalizeMessageBody(body: unknown): string {
    if (typeof body !== 'string') {
      return '';
    }

    const trimmed = body.trim();
    if (!trimmed) {
      return '';
    }

    if (this.looksLikeBase64(trimmed)) {
      return '';
    }

    return trimmed;
  }

  private looksLikeBase64(value: string): boolean {
    if (!value) {
      return false;
    }

    if (value.startsWith('/9j/') || value.startsWith('data:image')) {
      return true;
    }

    const compact = value.replace(/\s+/g, '');
    if (compact.length < 512) {
      return false;
    }

    return /^[A-Za-z0-9+/=]+$/.test(compact);
  }

  private truncateText(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, maxLength)}...`;
  }

  private formatImageFromMetadata(records?: any[]): string {
    const imageMetaRecord = records?.find((r) => r.type === 'IMAGE');
    const imageMeta = imageMetaRecord?.metadata;

    if (!imageMeta) {
      return '[Image]';
    }

    const matchedProduct = imageMeta?.matchedProducts?.[0];
    if (matchedProduct?.id) {
      const productName = matchedProduct.name || 'Produit';
      return `[${productName}] (${matchedProduct.id})`;
    }

    if (typeof imageMeta?.geminiDescription === 'string') {
      const geminiDescription = imageMeta.geminiDescription.trim();
      if (geminiDescription) {
        return `[Image] ${this.truncateText(geminiDescription, 180)}`;
      }
    }

    if (typeof imageMeta?.ocrText === 'string') {
      const ocrText = imageMeta.ocrText.trim();
      if (ocrText) {
        return `[Image OCR] ${this.truncateText(ocrText, 140)}`;
      }
    }

    return '[Image]';
  }

  private formatQuotedMessageForContext(quotedMessage: any): string {
    const records = Array.isArray(quotedMessage?.metadata)
      ? quotedMessage.metadata
      : [];
    const messageType = String(
      quotedMessage?.type || quotedMessage?.kind || '',
    ).toLowerCase();
    const lines: string[] = [];

    if (
      (messageType === 'product' || quotedMessage?.kind === 'product') &&
      quotedMessage?.productId
    ) {
      const productTitle = quotedMessage?.title || 'Produit';
      lines.push(`#PRODUCT: ${productTitle} (${quotedMessage.productId})`);
      return lines.join('\n');
    }

    const audioMeta = records.find((r) => r.type === 'AUDIO');
    if (audioMeta || messageType === 'audio' || messageType === 'ptt') {
      const transcript =
        audioMeta?.metadata?.transcript ||
        quotedMessage?.transcript ||
        quotedMessage?.metadata?.transcript ||
        '';
      const audioParts: string[] = [];

      if (typeof transcript === 'string' && transcript.trim()) {
        audioParts.push(`transcript="${this.truncateText(transcript.trim(), 220)}"`);
      }
      if (typeof audioMeta?.metadata?.language === 'string') {
        audioParts.push(`language=${audioMeta.metadata.language}`);
      }
      if (typeof audioMeta?.metadata?.confidence === 'number') {
        audioParts.push(`confidence=${audioMeta.metadata.confidence}`);
      }

      lines.push(`#AUDIO_METADATA: ${audioParts.join(' | ') || 'available'}`);
      return lines.join('\n');
    }

    const imageMetaRecord = records.find((r) => r.type === 'IMAGE');
    if (imageMetaRecord || messageType === 'image') {
      const imageMeta = imageMetaRecord?.metadata || {};
      const imageParts: string[] = [];
      const matchedProduct = imageMeta?.matchedProducts?.[0];

      if (matchedProduct?.id) {
        imageParts.push(
          `product=${matchedProduct.name || 'Produit'} (${matchedProduct.id})`,
        );
      }
      if (typeof imageMeta?.searchMethod === 'string' && imageMeta.searchMethod) {
        imageParts.push(`search_method=${imageMeta.searchMethod}`);
      }
      if (typeof imageMeta?.confidence === 'number') {
        imageParts.push(`confidence=${(imageMeta.confidence * 100).toFixed(1)}%`);
      }
      if (typeof imageMeta?.ocrText === 'string' && imageMeta.ocrText.trim()) {
        imageParts.push(
          `ocr="${this.truncateText(imageMeta.ocrText.trim(), 120)}"`,
        );
      }
      if (
        typeof imageMeta?.geminiDescription === 'string' &&
        imageMeta.geminiDescription.trim()
      ) {
        imageParts.push(
          `description="${this.truncateText(imageMeta.geminiDescription.trim(), 160)}"`,
        );
      }

      lines.push(`#IMAGE_METADATA: ${imageParts.join(' | ') || 'available'}`);
      return lines.join('\n');
    }

    const normalizedBody = this.normalizeMessageBody(quotedMessage?.body);
    lines.push(`#BODY: ${normalizedBody || '[Message cité]'}`);
    return lines.join('\n');
  }

  private formatTruncatedQuotedMessageForContext(quotedMessage: any): string {
    const formattedQuoted = this.formatQuotedMessageForContext(quotedMessage);
    const compactQuoted = formattedQuoted.replace(/\s+/g, ' ').trim();
    return this.truncateText(compactQuoted, 120);
  }

  private attachMessageIdToContext(messageLike: any, content: string): string {
    const messageId = this.extractMessageId(messageLike);
    if (!messageId) {
      return content;
    }

    return `Message ID: ${messageId}\n${content}`;
  }

  private formatMessageForContext(
    messageLike: any,
    includeQuoted: boolean = true,
    historyMessageIds?: Set<string>,
  ): string {
    if (!messageLike) {
      return '[Message sans texte]';
    }

    const records = Array.isArray(messageLike.metadata)
      ? messageLike.metadata
      : [];
    const audioMeta = records.find((r) => r.type === 'AUDIO');
    const transcript =
      audioMeta?.metadata?.transcript ||
      messageLike?.transcript ||
      messageLike?.metadata?.transcript ||
      '';

    const messageType = String(
      messageLike?.type || messageLike?.kind || '',
    ).toLowerCase();

    let content = '';

    if (
      (messageType === 'product' || messageLike?.kind === 'product') &&
      messageLike?.productId
    ) {
      const productTitle = messageLike.title || 'Produit';
      content = `[${productTitle}] (${messageLike.productId})`;
    } else if (typeof transcript === 'string' && transcript.trim()) {
      content = transcript.trim();
    } else {
      const normalizedBody = this.normalizeMessageBody(messageLike?.body);
      if (normalizedBody) {
        content = normalizedBody;
      } else if (messageType === 'image' || records.some((r) => r.type === 'IMAGE')) {
        content = this.formatImageFromMetadata(records);
      } else if (messageType === 'ptt' || messageType === 'audio') {
        content = '[Message vocal]';
      } else {
        content = '[Message sans texte]';
      }
    }

    const quotedMsg = this.extractQuotedMessage(messageLike);
    if (includeQuoted && quotedMsg) {
      if (this.isQuotedMessageAlreadyInHistory(messageLike, historyMessageIds)) {
        const truncatedQuoted =
          this.formatTruncatedQuotedMessageForContext(quotedMsg);
        return `Quoted Message:\n${truncatedQuoted}\nUser Message:\n${content}`;
      }

      const quotedContent = this.formatQuotedMessageForContext(quotedMsg);
      return `Quoted Message:\n${quotedContent}\nUser Message:\n${content}`;
    }

    return content;
  }

  /**
   * Build conversation history from message history
   * Converts WhatsApp messages to LangChain message format
   */
  private buildConversationHistory(
    messageHistory?: MessageHistory,
    currentMessageId?: string,
    historyMessageIds?: Set<string>,
  ): Array<{ role: string; content: string }> {
    if (!messageHistory || messageHistory.messages.length === 0) {
      return [];
    }

    const effectiveHistoryMessageIds =
      historyMessageIds ||
      this.buildHistoryContextMessageIds(messageHistory, currentMessageId);

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
        const content = this.attachMessageIdToContext(
          msg,
          this.formatMessageForContext(msg, true, effectiveHistoryMessageIds),
        );

        return {
          role: msg.fromMe ? 'assistant' : 'user',
          content,
        };
      });

    return history;
  }

  private extractReplyMessageFromTools(
    toolsUsed: Array<{ name: string; args: any; error?: string }>,
  ): string | undefined {
    const lastReplyTool = [...toolsUsed]
      .reverse()
      .find((tool) => tool.name === 'reply_to_message' && !tool.error);

    if (!lastReplyTool) {
      return undefined;
    }

    const args = lastReplyTool.args;
    if (args && typeof args === 'object' && typeof args.message === 'string') {
      const trimmed = args.message.trim();
      return trimmed || undefined;
    }

    if (typeof args === 'string') {
      try {
        const parsed = JSON.parse(args);
        if (parsed && typeof parsed.message === 'string') {
          const trimmed = parsed.message.trim();
          return trimmed || undefined;
        }
      } catch {
        // no-op: string arg is not JSON
      }
    }

    return undefined;
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
      let responseContent = '';

      if (
        lastMessage &&
        ToolMessage.isInstance(lastMessage) &&
        lastMessage.name === 'reply_to_message' &&
        lastMessage.status !== 'error'
      ) {
        responseContent =
          this.extractReplyMessageFromTools(callbackHandler.metrics.toolsUsed) ||
          '';

        if (!responseContent) {
          this.logger.warn(
            `reply_to_message completed but response text could not be resolved for ${chatId}`,
          );
        }
      } else if (lastMessage) {
        responseContent =
          typeof lastMessage.content === 'string'
            ? lastMessage.content
            : String(lastMessage.content);
      }

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

      const attemptedTools = callbackHandler.metrics.toolsUsed.map(
        (tool) => tool.name,
      );
      this.logger.warn(
        `Agent failed after ${attemptedTools.length} executed tool call(s): ${attemptedTools.join(', ') || 'none'}`,
      );

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
    metadata: Record<string, unknown> = {},
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
        metadata,
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

  private buildAnalyticsMetadata(
    message: MessageData,
    context: {
      chatId: string;
      contactId?: string;
      messageId?: string;
      ownerWhatsappId?: string;
    },
  ): Record<string, unknown> {
    const rawType = String(message?.type || message?.mediaKind || '').toLowerCase();
    const mediaKind = String(message?.mediaKind || '').toLowerCase();
    const normalizedType = mediaKind || rawType || 'text';

    return {
      sourceMessageId: context.messageId,
      ownerWhatsappId: context.ownerWhatsappId,
      contactId: context.contactId,
      chatId: context.chatId,
      isGroupMessage: context.chatId.includes('@g.us'),
      hasMedia: Boolean(message?.hasMedia),
      mediaKind: mediaKind || undefined,
      messageType: normalizedType,
    };
  }
}
