import { ConnectorClientService } from '@app/connector/connector-client.service';
import { PageScriptService } from '@app/page-scripts/page-script.service';
import { QueueService } from '@app/queue/queue.service';
import { tool } from '@langchain/core/tools';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { instrumentTools } from '../tool-logging.util';

/**
 * Messages tools for the WhatsApp agent
 * Handles message history and scheduling
 */
@Injectable()
export class MessagesTools {
  private readonly logger = new Logger(MessagesTools.name);

  constructor(
    private readonly connectorClient: ConnectorClientService,
    private readonly queueService: QueueService,
    private readonly scriptService: PageScriptService,
  ) {}

  /**
   * Create all messages tools
   */
  createTools() {
    const tools = [
      this.createGetOlderMessagesTool(),
      this.createGetMessagesAdvancedTool(),
      this.createGetMessageHistoryTool(),
      this.createScheduleIntentionTool(),
      this.createCancelIntentionTool(),
      this.createListIntentionsTool(),
    ];

    return instrumentTools(this.logger, MessagesTools.name, tools);
  }

  /**
   * Get older messages from a chat
   */
  private createGetOlderMessagesTool() {
    return tool(
      async ({ limit }, config?: any) => {
        try {
          const chatId = config?.context?.chatId;
          if (!chatId) {
            return JSON.stringify({
              success: false,
              error: 'No chatId in runtime context',
            });
          }

          const script = this.scriptService.getScript(
            'messages/getOlderMessages',
            {
              CHAT_ID: chatId,
              LIMIT: String(limit || 20),
            },
          );

          const { result: messages } =
            await this.connectorClient.executeScript(script);

          return JSON.stringify({
            success: true,
            messages,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'get_older_messages',
        description:
          'Fetch older messages from the current conversation only when the currently provided history is not sufficient.',
        schema: z.object({
          limit: z
            .number()
            .default(20)
            .describe('Number of messages to retrieve'),
        }),
      },
    );
  }

  /**
   * Get messages with advanced options (direction, reference message, etc.)
   */
  private createGetMessagesAdvancedTool() {
    return tool(
      async ({ count, direction, messageId, onlyUnread }, config?: any) => {
        try {
          const chatId = config?.context?.chatId;
          if (!chatId) {
            return JSON.stringify({
              success: false,
              error: 'No chatId in runtime context',
            });
          }

          const script = this.scriptService.getScript(
            'messages/getMessagesAdvanced',
            {
              CHAT_ID: chatId,
              COUNT: String(count || 20),
              DIRECTION: direction || 'before',
              MESSAGE_ID: messageId || '',
              ONLY_UNREAD: String(onlyUnread || false),
            },
          );

          const { result } = await this.connectorClient.executeScript(script);

          return JSON.stringify(result);
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'get_messages_advanced',
        description:
          'Fetch messages with advanced options only when precise history navigation is required to answer correctly.',
        schema: z.object({
          count: z
            .number()
            .default(20)
            .describe(
              'Number of messages to retrieve (use -1 for all messages)',
            ),
          direction: z
            .enum(['before', 'after'])
            .optional()
            .describe(
              "Fetch direction relative to the reference message ('before' for older, 'after' for newer)",
            ),
          messageId: z
            .string()
            .optional()
            .describe('Reference message ID for directional fetching'),
          onlyUnread: z
            .boolean()
            .optional()
            .default(false)
            .describe('Fetch only unread messages'),
        }),
      },
    );
  }

  /**
   * Get message history summary for a chat
   */
  private createGetMessageHistoryTool() {
    return tool(
      async ({ maxTotal, messageId, direction }, config?: any) => {
        try {
          const chatId = config?.context?.chatId;
          if (!chatId) {
            return JSON.stringify({
              success: false,
              error: 'No chatId in runtime context',
            });
          }

          const script = this.scriptService.getScript(
            'messages/getMessageHistory',
            {
              CHAT_ID: chatId,
              MAX_TOTAL: String(maxTotal || 20),
              MESSAGE_ID: messageId || '',
              DIRECTION: direction || 'before',
            },
          );

          const result = await this.connectorClient.executeScript(script);

          return JSON.stringify(result);
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'get_message_history',
        description:
          'Retrieve message history only when provided context is insufficient. Supports fetching before or after a reference message ID.',
        schema: z.object({
          maxTotal: z
            .number()
            .default(20)
            .describe('Maximum number of messages to retrieve'),
          messageId: z
            .string()
            .optional()
            .describe('Reference message ID to fetch around'),
          direction: z
            .enum(['before', 'after'])
            .optional()
            .default('before')
            .describe(
              "Fetch direction relative to the reference message ('before' for older, 'after' for newer)",
            ),
        }),
      },
    );
  }

  /**
   * Schedule an intention (intelligent reminder with condition checking)
   */
  private createScheduleIntentionTool() {
    return tool(
      async (
        {
          scheduledFor,
          type,
          reason,
          conditionToCheck,
          actionIfTrue,
          actionIfFalse,
          metadata,
        },
        config?: any,
      ) => {
        try {
          const chatId = config?.context?.chatId;
          if (!chatId) {
            return JSON.stringify({
              success: false,
              error: 'No chatId in runtime context',
            });
          }

          // Parse scheduled date
          const scheduledDate = new Date(scheduledFor);

          if (isNaN(scheduledDate.getTime())) {
            return JSON.stringify({
              success: false,
              error:
                'Date invalide. Format attendu: ISO 8601 (ex: 2025-11-27T10:00:00Z)',
            });
          }

          if (scheduledDate <= new Date()) {
            return JSON.stringify({
              success: false,
              error: 'La date doit être dans le futur',
            });
          }

          // Schedule intention
          const result = await this.queueService.scheduleIntention(
            chatId,
            scheduledDate,
            {
              type,
              reason,
              conditionToCheck,
              actionIfTrue,
              actionIfFalse,
              metadata: metadata ? JSON.parse(metadata) : {},
              createdByRole: 'agent',
            },
          );

          return JSON.stringify({
            success: true,
            intentionId: result.intentionId,
            message: `Intention programmée pour ${scheduledDate.toISOString()}`,
            scheduledFor: scheduledDate.toISOString(),
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'schedule_intention',
        description:
          "Schedule a smart intention for the current conversation that checks a condition before acting. Example: 'Follow up in 2 days IF the customer has not replied'. Use your tools to verify the condition at the scheduled time.",
        schema: z.object({
          scheduledFor: z
            .string()
            .describe(
              'Date and time of the check in ISO 8601 (e.g. 2025-11-27T10:00:00Z)',
            ),
          type: z
            .enum([
              'FOLLOW_UP',
              'ORDER_REMINDER',
              'PAYMENT_REMINDER',
              'DELIVERY_UPDATE',
              'CUSTOM',
            ])
            .describe('Intention type'),
          reason: z
            .string()
            .describe(
              "Reason for the intention (e.g. 'Customer interested in iPhone 15')",
            ),
          conditionToCheck: z
            .string()
            .describe(
              "Condition to verify (e.g. 'Customer replied', 'Order placed'). You will check this with your tools.",
            ),
          actionIfTrue: z
            .string()
            .optional()
            .describe(
              "Action if condition is TRUE (e.g. 'Thank the customer')",
            ),
          actionIfFalse: z
            .string()
            .describe(
              "Action if condition is FALSE (e.g. 'Send a reminder with product link')",
            ),
          metadata: z
            .string()
            .optional()
            .describe('Optional JSON metadata (e.g. productId, orderId)'),
        }),
      },
    );
  }

  /**
   * Cancel an intention
   */
  private createCancelIntentionTool() {
    return tool(
      async ({ intentionId }, config?: any) => {
        try {
          const result = await this.queueService.cancelIntention(
            intentionId,
            'agent',
          );

          return JSON.stringify({
            success: true,
            message: 'Intention annulée avec succès',
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'cancel_intention',
        description:
          'Cancel a scheduled intention. Useful if the customer asks to stop reminders or the context changes.',
        schema: z.object({
          intentionId: z.string().describe('Intention ID to cancel'),
        }),
      },
    );
  }

  /**
   * List pending intentions for a chat
   */
  private createListIntentionsTool() {
    return tool(
      async (_input, config?: any) => {
        try {
          const chatId = config?.context?.chatId;
          if (!chatId) {
            return JSON.stringify({
              success: false,
              error: 'No chatId in runtime context',
            });
          }

          const intentions =
            await this.queueService.getPendingIntentions(chatId);

          return JSON.stringify({
            success: true,
            intentions: intentions.map((i) => ({
              id: i.id,
              type: i.type,
              reason: i.reason,
              scheduledFor: i.scheduledFor.toISOString(),
              conditionToCheck: i.conditionToCheck,
            })),
            count: intentions.length,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'list_intentions',
        description:
          'List all scheduled intentions for the current conversation. Useful to see pending reminders.',
        schema: z.object({}),
      },
    );
  }
}
