import { ConnectorClientService } from '@app/connector/connector-client.service';
import { PageScriptService } from '@app/page-scripts/page-script.service';
import { tool } from '@langchain/core/tools';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { ContactResolverService } from '../contact/contact-resolver.service';

import { ProductSendService } from './product-send.service';

/**
 * Communication tools for the WhatsApp agent
 * Handles sending messages, products, and forwarding to management
 */
@Injectable()
export class CommunicationTools {
  constructor(
    private readonly connectorClient: ConnectorClientService,
    private readonly scriptService: PageScriptService,
    private readonly productSendService: ProductSendService,
    private readonly contactResolver: ContactResolverService,
  ) {}

  /**
   * Create all communication tools
   */
  createTools() {
    return [
      this.createSendMessageTool(),
      this.createSendProductTool(),
      this.createSendProductsTool(),
      this.createSendCollectionTool(),
      this.createSendCatalogLinkTool(),
      this.createForwardToManagementGroupTool(),
    ];
  }

  /**
   * Send a short text message (max 500 chars)
   */
  private createSendMessageTool() {
    return tool(
      async ({ message }, config?: any) => {
        try {
          const chatId = config?.context?.chatId;
          if (!chatId) {
            return JSON.stringify({
              success: false,
              error: 'No chatId in runtime context',
            });
          }

          // Validate message length
          if (message.length > 500) {
            return JSON.stringify({
              success: false,
              error:
                'Message trop long. Maximum 500 caractères. Divisez en plusieurs messages.',
            });
          }

          // Send via connector (uses connector's built-in sendMessage)
          const result = await this.connectorClient.sendMessage(
            chatId,
            message,
          );

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
          'Send a SHORT text message (max 500 characters) to the current conversation. If longer, split it into multiple messages.',
        returnDirect: true,
        schema: z.object({
          message: z
            .string()
            .max(500)
            .describe('Message content (max 500 characters)'),
        }),
      },
    );
  }

  /**
   * Send a product from the WhatsApp catalog
   */
  private createSendProductTool() {
    return tool(
      async ({ productId }, config?: any) => {
        try {
          const chatId = config?.context?.chatId;
          if (!chatId) {
            return JSON.stringify({
              success: false,
              error: 'No chatId in runtime context',
            });
          }

          const result = await this.productSendService.sendProduct(
            chatId,
            productId,
          );

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
          'Send a WhatsApp Business catalog product to the current customer',
        schema: z.object({
          productId: z.string().describe('Product ID to send'),
        }),
      },
    );
  }

  /**
   * Send multiple products from the WhatsApp catalog
   */
  private createSendProductsTool() {
    return tool(
      async ({ productIds }, config?: any) => {
        try {
          const chatId = config?.context?.chatId;
          if (!chatId) {
            return JSON.stringify({
              success: false,
              error: 'No chatId in runtime context',
            });
          }

          const result = await this.productSendService.sendProducts(
            chatId,
            productIds,
          );

          return JSON.stringify({
            success: true,
            message: 'Produits envoyés avec succès',
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
        name: 'send_products',
        description:
          'Send multiple WhatsApp Business catalog products to the current customer',
        schema: z.object({
          productIds: z
            .array(z.string())
            .min(1)
            .describe('List of product IDs to send'),
        }),
      },
    );
  }

  /**
   * Send a catalog collection
   */
  private createSendCollectionTool() {
    return tool(
      async ({ collectionId }, config?: any) => {
        try {
          const chatId = config?.context?.chatId;
          if (!chatId) {
            return JSON.stringify({
              success: false,
              error: 'No chatId in runtime context',
            });
          }

          const result = await this.productSendService.sendCollection(
            chatId,
            collectionId,
          );

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
        description: 'Send a full catalog collection to the current customer',
        schema: z.object({
          collectionId: z.string().describe('Collection ID to send'),
        }),
      },
    );
  }

  /**
   * Send a catalog link to a chat
   */
  private createSendCatalogLinkTool() {
    return tool(
      async ({ ownerId }, config?: any) => {
        try {
          const chatId = config?.context?.chatId;
          if (!chatId) {
            return JSON.stringify({
              success: false,
              error: 'No chatId in runtime context',
            });
          }

          const script = this.scriptService.getScript(
            'communication/sendCatalogLink',
            {
              TO: chatId,
              OWNER_ID: ownerId,
            },
          );

          const result = await this.connectorClient.executeScript(script);

          return JSON.stringify({
            success: true,
            message: 'Lien du catalogue envoyé avec succès',
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
        name: 'send_catalog_link',

        description:
          'Send the WhatsApp Business catalog link to the current customer',
        schema: z.object({
          ownerId: z
            .string()
            .optional()
            .describe(
              'Catalog owner ID (format: 237xxx@c.us). If omitted, uses the current session ID.',
            ),
        }),
      },
    );
  }

  /**
   * Forward a conversation to the management group
   */
  private createForwardToManagementGroupTool() {
    return tool(
      async ({ reason }, config?: any) => {
        try {
          // Get management group ID from context
          const managementGroupId = config?.context?.managementGroupId;
          const chatId = config?.context?.chatId;

          if (!managementGroupId) {
            return JSON.stringify({
              success: false,
              error: 'Aucun groupe de gestion configuré',
            });
          }

          if (!chatId) {
            return JSON.stringify({
              success: false,
              error: 'No chatId in runtime context',
            });
          }

          // Send notification message to management group
          const formattedContact =
            await this.contactResolver.resolveContactNumber(config?.context);
          const notificationMessage = `🔔 Nouvelle conversation transférée\n\nDe: ${formattedContact}\nRaison: ${reason}\n\nMerci de prendre en charge cette conversation.`;

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
          'Forward the current conversation to the management group when the agent cannot help',
        schema: z.object({
          reason: z
            .string()
            .describe(
              "Reason for the transfer (e.g. 'Customer requests a refund')",
            ),
        }),
      },
    );
  }
}
