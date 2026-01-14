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
      this.createScheduleIntentionTool(),
      this.createCancelIntentionTool(),
      this.createListIntentionsTool(),
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
   * Schedule an intention (intelligent reminder with condition checking)
   */
  private createScheduleIntentionTool() {
    return tool(
      async (
        {
          chatId,
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
          "Programmer une intention intelligente qui vérifie une condition avant d'agir. Ex: 'Relancer le client dans 2 jours SI il n'a pas répondu'. Utilise tes tools pour vérifier la condition au moment voulu.",
        schema: z.object({
          chatId: z
            .string()
            .describe('ID du chat WhatsApp (format: 237xxx@c.us)'),
          scheduledFor: z
            .string()
            .describe(
              'Date et heure de vérification au format ISO 8601 (ex: 2025-11-27T10:00:00Z)',
            ),
          type: z
            .enum([
              'FOLLOW_UP',
              'ORDER_REMINDER',
              'PAYMENT_REMINDER',
              'DELIVERY_UPDATE',
              'CUSTOM',
            ])
            .describe("Type d'intention"),
          reason: z
            .string()
            .describe(
              "Raison de l'intention (ex: 'Client intéressé par iPhone 15')",
            ),
          conditionToCheck: z
            .string()
            .describe(
              "Condition à vérifier (ex: 'Client a répondu au message', 'Commande a été passée'). Tu vérifieras ceci avec tes tools.",
            ),
          actionIfTrue: z
            .string()
            .optional()
            .describe(
              "Action si la condition est VRAIE (ex: 'Remercier le client')",
            ),
          actionIfFalse: z
            .string()
            .describe(
              "Action si la condition est FAUSSE (ex: 'Envoyer un rappel avec lien produit')",
            ),
          metadata: z
            .string()
            .optional()
            .describe('Métadonnées JSON optionnelles (ex: productId, orderId)'),
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
          "Annuler une intention programmée. Utile si le client demande d'arrêter les rappels ou si le contexte a changé.",
        schema: z.object({
          intentionId: z.string().describe("ID de l'intention à annuler"),
        }),
      },
    );
  }

  /**
   * List pending intentions for a chat
   */
  private createListIntentionsTool() {
    return tool(
      async ({ chatId }, config?: any) => {
        try {
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
          'Lister toutes les intentions programmées pour un client. Utile pour voir les rappels en attente.',
        schema: z.object({
          chatId: z
            .string()
            .describe('ID du chat WhatsApp (format: 237xxx@c.us)'),
        }),
      },
    );
  }
}
