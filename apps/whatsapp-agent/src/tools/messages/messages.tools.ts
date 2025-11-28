import { ConnectorClientService } from '@app/connector/connector-client.service';
import { PageScriptService } from '@app/page-scripts/page-script.service';
import { QueueService } from '@app/queue/queue.service';
import { tool } from '@langchain/core/tools';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

/**
 * Messages tools for the WhatsApp agent
 * Handles message history and scheduling
 */
@Injectable()
export class MessagesTools {
  constructor(
    private readonly connectorClient: ConnectorClientService,
    private readonly queueService: QueueService,
    private readonly scriptService: PageScriptService,
  ) {}

  /**
   * Create all messages tools
   */
  createTools() {
    return [
      this.createGetOlderMessagesTool(),
      this.createScheduleMessageTool(),
    ];
  }

  /**
   * Get older messages from a chat
   */
  private createGetOlderMessagesTool() {
    return tool(
      async ({ chatId, limit }, config?: any) => {
        try {
          const script = this.scriptService.getScript(
            'messages/getOlderMessages',
            {
              CHAT_ID: chatId,
              LIMIT: String(limit || 20),
            },
          );

          const messages = await this.connectorClient.executeScript(script);

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
          "Récupérer l'historique des messages plus anciens d'une conversation pour comprendre le contexte",
        schema: z.object({
          chatId: z
            .string()
            .describe('ID du chat WhatsApp (format: 237xxx@c.us)'),
          limit: z
            .number()
            .default(20)
            .describe('Nombre de messages à récupérer'),
        }),
      },
    );
  }

  /**
   * Schedule a message for later
   */
  private createScheduleMessageTool() {
    return tool(
      async ({ chatId, scheduledFor, context }, config?: any) => {
        try {
          // Parse scheduled date
          const scheduledDate = new Date(scheduledFor);

          if (isNaN(scheduledDate.getTime())) {
            return JSON.stringify({
              success: false,
              error:
                'Date invalide. Format attendu: ISO 8601 (ex: 2025-11-26T10:00:00Z)',
            });
          }

          if (scheduledDate <= new Date()) {
            return JSON.stringify({
              success: false,
              error: 'La date doit être dans le futur',
            });
          }

          // Add to queue
          await this.queueService.scheduleMessage(chatId, scheduledDate, {
            reason: context,
            intentToCheck: 'default',
            actionIfFalse: 'send_reminder',
          });

          return JSON.stringify({
            success: true,
            message: `Message programmé pour ${scheduledDate.toISOString()}`,
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
        name: 'schedule_message',
        description:
          'Programmer un rappel automatique pour plus tard (ex: relance client, suivi commande)',
        schema: z.object({
          chatId: z
            .string()
            .describe('ID du chat WhatsApp (format: 237xxx@c.us)'),
          scheduledFor: z
            .string()
            .describe(
              'Date et heure du rappel au format ISO 8601 (ex: 2025-11-26T10:00:00Z)',
            ),
          context: z
            .string()
            .describe(
              "Contexte du rappel (ex: 'Relancer le client pour sa commande #123')",
            ),
        }),
      },
    );
  }
}
