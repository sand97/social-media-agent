import { ConnectorClientService } from '@app/connector/connector-client.service';
import { PageScriptService } from '@app/page-scripts/page-script.service';
import { tool } from '@langchain/core/tools';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

/**
 * Communication tools for the WhatsApp agent
 * Handles sending messages, products, and forwarding to management
 */
@Injectable()
export class CommunicationTools {
  constructor(
    private readonly connectorClient: ConnectorClientService,
    private readonly scriptService: PageScriptService,
  ) {}

  /**
   * Create all communication tools
   */
  createTools() {
    return [
      this.createSendMessageTool(),
      this.createSendProductTool(),
      this.createSendCollectionTool(),
      this.createForwardToManagementGroupTool(),
    ];
  }

  /**
   * Send a short text message (max 500 chars)
   */
  private createSendMessageTool() {
    return tool(
      async ({ to, message }, config?: any) => {
        try {
          // Validate message length
          if (message.length > 500) {
            return JSON.stringify({
              success: false,
              error:
                'Message trop long. Maximum 500 caractères. Divisez en plusieurs messages.',
            });
          }

          // Send via connector (uses connector's built-in sendMessage)
          const result = await this.connectorClient.sendMessage(to, message);

          return JSON.stringify({
            success: true,
            message: 'Message envoyé avec succès',
            result,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'send_message',
        description:
          'Envoyer un message texte COURT (max 500 caractères). Si le message est plus long, divisez-le en plusieurs messages.',
        schema: z.object({
          to: z.string().describe('ID du chat WhatsApp (format: 237xxx@c.us)'),
          message: z
            .string()
            .max(500)
            .describe('Contenu du message (max 500 caractères)'),
        }),
      },
    );
  }

  /**
   * Send a product from the WhatsApp catalog
   */
  private createSendProductTool() {
    return tool(
      async ({ to, productId }, config?: any) => {
        try {
          const script = this.scriptService.getScript(
            'communication/sendProduct',
            {
              TO: to,
              PRODUCT_ID: productId,
            },
          );

          const result = await this.connectorClient.executeScript(script);

          return JSON.stringify({
            success: true,
            message: 'Produit envoyé avec succès',
            result,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'send_product',
        description:
          'Envoyer un produit du catalogue WhatsApp Business au client',
        schema: z.object({
          to: z.string().describe('ID du chat WhatsApp (format: 237xxx@c.us)'),
          productId: z.string().describe('ID du produit à envoyer'),
        }),
      },
    );
  }

  /**
   * Send a catalog collection
   */
  private createSendCollectionTool() {
    return tool(
      async ({ to, collectionId }, config?: any) => {
        try {
          const script = this.scriptService.getScript(
            'communication/sendCollection',
            {
              TO: to,
              COLLECTION_ID: collectionId,
            },
          );

          const result = await this.connectorClient.executeScript(script);

          return JSON.stringify({
            success: true,
            message: 'Collection envoyée avec succès',
            result,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'send_collection',
        description: 'Envoyer une collection complète du catalogue au client',
        schema: z.object({
          to: z.string().describe('ID du chat WhatsApp (format: 237xxx@c.us)'),
          collectionId: z.string().describe('ID de la collection à envoyer'),
        }),
      },
    );
  }

  /**
   * Forward a conversation to the management group
   */
  private createForwardToManagementGroupTool() {
    return tool(
      async ({ originalChatId, reason }, config?: any) => {
        try {
          // Get management group ID from context
          const managementGroupId = config?.context?.managementGroupId;

          if (!managementGroupId) {
            return JSON.stringify({
              success: false,
              error: 'Aucun groupe de gestion configuré',
            });
          }

          // Send notification message to management group
          const notificationMessage = `🔔 Nouvelle conversation transférée\n\nDe: ${originalChatId}\nRaison: ${reason}\n\nMerci de prendre en charge cette conversation.`;

          await this.connectorClient.sendMessage(
            managementGroupId,
            notificationMessage,
          );

          return JSON.stringify({
            success: true,
            message: 'Conversation transférée au groupe de gestion',
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'forward_to_management_group',
        description:
          "Transférer la conversation au groupe de gestion quand l'agent ne peut pas aider",
        schema: z.object({
          originalChatId: z
            .string()
            .describe('ID du chat original (format: 237xxx@c.us)'),
          reason: z
            .string()
            .describe(
              "Raison du transfert (ex: 'Client demande un remboursement')",
            ),
        }),
      },
    );
  }
}
