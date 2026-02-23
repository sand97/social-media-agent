import { ConnectorClientService } from '@app/connector/connector-client.service';
import { PageScriptService } from '@app/page-scripts/page-script.service';
import { tool } from '@langchain/core/tools';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { ContactResolverService } from '../contact/contact-resolver.service';
import { AdminGroupMessagingService } from './admin-group-messaging.service';
/**
 * Chat tools for the WhatsApp agent
 * Provides comprehensive messaging and chat management capabilities
 */
@Injectable()
export class ChatTools {
  private readonly logger = new Logger(ChatTools.name);

  constructor(
    private readonly connectorClient: ConnectorClientService,
    private readonly scriptService: PageScriptService,
    private readonly contactResolver: ContactResolverService,
    private readonly adminGroupMessagingService: AdminGroupMessagingService,
  ) {}

  /**
   * Create all chat tools
   */
  createTools() {
    return [
      this.createReplyToMessageTool(), // SECURED: Reply to current conversation only
      this.createSendToAdminGroupTool(), // SECURED: Send to admin group only
      this.createNotifyAuthorizedGroupTool(), // SECURED: Send to authorized group + reply to user
      this.createSendReactionTool(),
      this.createSendLocationTool(),
      this.createSetNotesTool(),
      this.createSendScheduledCallTool(),
      this.createGetQuotedMessageTool(),
    ];
  }

  /**
   * Reply to current conversation (SECURED - cannot send to arbitrary contacts)
   */
  private createReplyToMessageTool() {
    return tool(
      async ({ message, quotedMessageId }, config?: any) => {
        try {
          const chatId = config?.context?.chatId;
          console.log('send message', chatId);

          if (!chatId) {
            return JSON.stringify({
              success: false,
              error: 'No chatId in runtime context',
            });
          }

          this.logger.log(`Replying to conversation: ${chatId}`);

          const script = this.scriptService.getScript('chat/sendTextMessage', {
            TO: chatId,
            MESSAGE: message,
            USE_TYPING: 'true',
            QUOTED_MESSAGE_ID: quotedMessageId || '',
          });

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
        name: 'reply_to_message',
        description:
          'REQUIRED: Use this tool for EVERY reply to the customer. The agent will show "typing..." for a natural delay (80 WPM). This tool is the ONLY way to communicate with the customer - NEVER reply directly without using this tool.',
        returnDirect: true,
        schema: z.object({
          message: z.string().describe('Message content to send'),
          quotedMessageId: z
            .string()
            .optional()
            .describe('Message ID to reply to (quoted message)'),
        }),
      },
    );
  }

  /**
   * Send message to admin/management group (SECURED - only to configured group)
   */
  private createSendToAdminGroupTool() {
    return tool(
      async ({ message, replyToUser }, config?: any) => {
        try {
          // SECURITY: Only send to the configured managementGroupId from runtime context
          const managementGroupId = config?.context?.managementGroupId;
          const chatId = config?.context?.chatId;
          const contactId = config?.context?.contactId;

          if (!managementGroupId) {
            return JSON.stringify({
              success: false,
              error:
                'No management group configured. Please configure a management group first.',
            });
          }

          this.logger.log(`Forwarding message to management group: ${managementGroupId}`);

          const result =
            await this.adminGroupMessagingService.sendToManagementGroup({
              managementGroupId,
              message,
              chatId,
              contactId,
              shouldReplyToUser: true,
              replyToUser,
            });

          return JSON.stringify(result);
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'send_to_admin_group',
        description:
          'Send a message to the admin/management group and reply to the customer. Use ONLY to escalate requests that require human intervention.',
        returnDirect: true,
        schema: z.object({
          message: z
            .string()
            .describe(
              "Message to forward to the admin group. Include context and the reason for escalation. Example: 'Customer requests urgent cancellation of booking #123. Manual intervention needed.'",
            ),
          replyToUser: z
            .string()
            .optional()
            .describe(
              'Short message sent to the customer to confirm it is being handled (optional).',
            ),
        }),
      },
    );
  }

  /**
   * Notify an authorized group and reply to the current user
   */
  private createNotifyAuthorizedGroupTool() {
    return tool(
      async ({ groupId, message, replyToUser }, config?: any) => {
        try {
          const chatId = config?.context?.chatId;
          const authorizedGroups = config?.context?.authorizedGroups || [];

          if (!chatId) {
            return JSON.stringify({
              success: false,
              error: 'No chatId in runtime context',
            });
          }

          if (!authorizedGroups || authorizedGroups.length === 0) {
            return JSON.stringify({
              success: false,
              error: 'No authorized groups available for this user',
            });
          }

          const targetGroup = authorizedGroups.find(
            (group: any) => group.whatsappGroupId === groupId,
          );

          if (!targetGroup) {
            return JSON.stringify({
              success: false,
              error: `Group not authorized: ${groupId}`,
            });
          }

          // Enrich message with contact number automatically
          const formattedContact =
            await this.contactResolver.resolveContactNumber(config?.context);
          const enrichedMessage = `📱 Contact: ${formattedContact}\n\n${message}`;

          const groupScript = this.scriptService.getScript(
            'chat/sendTextMessage',
            {
              TO: groupId,
              MESSAGE: enrichedMessage,
              USE_TYPING: 'true',
            },
          );

          const groupResult =
            await this.connectorClient.executeScript(groupScript);

          const reply =
            replyToUser?.trim() ||
            "Merci, je vérifie auprès de l'équipe et je reviens vers vous.";

          const replyScript = this.scriptService.getScript(
            'chat/sendTextMessage',
            {
              TO: chatId,
              MESSAGE: reply,
              USE_TYPING: 'true',
            },
          );

          const userResult =
            await this.connectorClient.executeScript(replyScript);

          return JSON.stringify({
            success: true,
            group: {
              whatsappGroupId: targetGroup.whatsappGroupId,
              usage: targetGroup.usage,
              name: targetGroup.name,
            },
            groupResult,
            userResult,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'notify_authorized_group',
        description:
          'Send a message to an authorized group AFTER collecting all required information from the customer. The contact number is automatically added. IMPORTANT: Use your business context to identify the key information to collect BEFORE using this tool.',
        returnDirect: true,
        schema: z.object({
          groupId: z
            .string()
            .describe('Authorized group ID (format: xxxxx@g.us)'),
          message: z
            .string()
            .describe(
              'Full message to send to the group. MUST include: a clear summary of the request + ALL information collected per your business context. Structure it clearly so the team can act immediately.',
            ),
          replyToUser: z
            .string()
            .optional()
            .describe(
              "Short message sent to the customer (optional). Example: 'I am checking availability and will get back to you soon.'",
            ),
        }),
      },
    );
  }

  /**
   * Send reaction to a message
   */
  private createSendReactionTool() {
    return tool(
      async ({ messageId, reaction }, config?: any) => {
        try {
          const script = this.scriptService.getScript('chat/sendReaction', {
            MESSAGE_ID: messageId,
            REACTION: reaction,
          });

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
        name: 'send_reaction',
        description:
          'Send an emoji reaction to a message. Useful for quick feedback without interrupting the conversation. Use "false" to remove a reaction.',
        schema: z.object({
          messageId: z
            .string()
            .describe('Message ID to react to (format: true_xxxxx@c.us_yyyy)'),
          reaction: z
            .string()
            .describe(
              'Reaction emoji (👍, ❤️, 😊, etc.) or "false" to remove the reaction',
            ),
        }),
      },
    );
  }

  /**
   * Send location message
   */
  private createSendLocationTool() {
    return tool(
      async ({ lat, lng, name, address, url }, config?: any) => {
        try {
          const chatId = config?.context?.chatId;
          if (!chatId) {
            return JSON.stringify({
              success: false,
              error: 'No chatId in runtime context',
            });
          }

          const script = this.scriptService.getScript('chat/sendLocation', {
            TO: chatId,
            LAT: String(lat),
            LNG: String(lng),
            NAME: name || '',
            ADDRESS: address || '',
            URL: url || '',
          });

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
        name: 'send_location',
        description:
          'Send a location to the current conversation. Great for sharing store address, pickup points, delivery locations, etc.',
        schema: z.object({
          lat: z.number().describe('Latitude (e.g. 48.8566 for Paris)'),
          lng: z.number().describe('Longitude (e.g. 2.3522 for Paris)'),
          name: z
            .string()
            .optional()
            .describe('Place name (e.g. "Our Paris Store")'),
          address: z
            .string()
            .optional()
            .describe('Full address (e.g. "123 Rue de la Paix, 75001 Paris")'),
          url: z
            .string()
            .optional()
            .describe('Related URL (e.g. Google Maps link)'),
        }),
      },
    );
  }

  /**
   * Edit a previously sent message
   */
  private createEditMessageTool() {
    return tool(
      async ({ messageId, newText, linkPreview }, config?: any) => {
        try {
          const script = this.scriptService.getScript('chat/editMessage', {
            MESSAGE_ID: messageId,
            NEW_TEXT: newText,
            LINK_PREVIEW: String(linkPreview !== false),
          });

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
        name: 'edit_message',
        description:
          'Edit a previously sent message. Useful to fix mistakes or update information.',
        schema: z.object({
          messageId: z
            .string()
            .describe('Message ID to edit (format: true_xxxxx@c.us_yyyy)'),
          newText: z.string().describe('New message content'),
          linkPreview: z
            .boolean()
            .optional()
            .default(true)
            .describe('Enable link preview'),
        }),
      },
    );
  }

  /**
   * Mark chat as unread
   */
  private createMarkIsUnreadTool() {
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

          const script = this.scriptService.getScript('chat/markIsUnread', {
            CHAT_ID: chatId,
          });

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
        name: 'mark_unread',
        description:
          'Mark the current conversation as unread. Useful to flag conversations that need human follow-up.',
        schema: z.object({}),
      },
    );
  }

  /**
   * Set internal notes for a chat
   */
  private createSetNotesTool() {
    return tool(
      async ({ content }, config?: any) => {
        try {
          const chatId = config?.context?.chatId;
          if (!chatId) {
            return JSON.stringify({
              success: false,
              error: 'No chatId in runtime context',
            });
          }

          const script = this.scriptService.getScript('chat/setNotes', {
            CHAT_ID: chatId,
            CONTENT: content,
          });

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
        name: 'set_notes',
        description:
          'Set internal notes for the current conversation (agent memory). IMPORTANT: Requires a WhatsApp Business account. Useful for storing customer preferences, history, context.',
        schema: z.object({
          content: z
            .string()
            .describe('Notes content (preferences, history, context, etc.)'),
        }),
      },
    );
  }

  /**
   * Send scheduled call message
   */
  private createSendScheduledCallTool() {
    return tool(
      async ({ title, description, callType, timestampMs }, config?: any) => {
        try {
          const chatId = config?.context?.chatId;
          if (!chatId) {
            return JSON.stringify({
              success: false,
              error: 'No chatId in runtime context',
            });
          }

          const script = this.scriptService.getScript(
            'chat/sendScheduledCall',
            {
              TO: chatId,
              TITLE: title,
              DESCRIPTION: description || '',
              CALL_TYPE: callType || 'voice',
              TIMESTAMP_MS: String(timestampMs),
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
        name: 'send_scheduled_call',
        description:
          'Send a scheduled call invite to the current conversation. Great for booking appointments, consultations, phone support.',
        schema: z.object({
          title: z
            .string()
            .describe('Call title (e.g. "Support Consultation")'),
          description: z.string().optional().describe('Call description'),
          callType: z
            .enum(['voice', 'video'])
            .optional()
            .default('voice')
            .describe('Call type: voice or video'),
          timestampMs: z
            .number()
            .describe(
              'Call timestamp in milliseconds since epoch (Date.now())',
            ),
        }),
      },
    );
  }

  /**
   * Get quoted message
   */
  private createGetQuotedMessageTool() {
    return tool(
      async ({ messageId }, config?: any) => {
        try {
          const script = this.scriptService.getScript('chat/getQuotedMessage', {
            MESSAGE_ID: messageId,
          });

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
        name: 'get_quoted_message',
        description:
          'Retrieve the quoted/replied message in a conversation. Useful to understand reply context.',
        schema: z.object({
          messageId: z.string().describe('Message ID that contains a quote'),
        }),
      },
    );
  }

  /**
   * Mark chat as read
   */
  private createMarkIsReadTool() {
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

          const script = this.scriptService.getScript('chat/markIsRead', {
            CHAT_ID: chatId,
          });

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
        name: 'mark_read',
        description:
          'Mark the current conversation as read and send the SEEN event. Useful after handling messages to indicate they were read.',
        schema: z.object({}),
      },
    );
  }
}
