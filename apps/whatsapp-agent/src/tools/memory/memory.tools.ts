import { PrismaService } from '@app/prisma/prisma.service';
import { tool } from '@langchain/core/tools';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

/**
 * Memory tools for the WhatsApp agent
 * Handles persistent memory storage and retrieval
 */
@Injectable()
export class MemoryTools {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create all memory tools
   */
  createTools() {
    return [
      this.createSavePersistentMemoryTool(),
      this.createRetrievePersistentMemoryTool(),
    ];
  }

  /**
   * Save a persistent memory for a chat
   */
  private createSavePersistentMemoryTool() {
    return tool(
      async ({ chatId, type, key, value, expiresInDays }, config?: any) => {
        try {
          // Calculate expiration date
          let expiresAt: Date | undefined;
          if (expiresInDays) {
            expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + expiresInDays);
          }

          // Save memory
          await this.prisma.conversationMemory.create({
            data: {
              chatId,
              type: type as any,
              key,
              value,
              expiresAt,
            },
          });

          return JSON.stringify({
            success: true,
            message: 'Mémoire sauvegardée avec succès',
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'save_persistent_memory',
        description:
          'Sauvegarder une mémoire persistante importante (préférence client, note VIP, information de commande, etc.). Ces informations seront disponibles lors des futures conversations.',
        schema: z.object({
          chatId: z
            .string()
            .describe('ID du chat WhatsApp (format: 237xxx@c.us)'),
          type: z
            .enum(['PREFERENCE', 'VIP_NOTE', 'ORDER', 'CONTEXT'])
            .describe(
              'Type de mémoire: PREFERENCE (préférence client), VIP_NOTE (note VIP), ORDER (commande), CONTEXT (contexte)',
            ),
          key: z
            .string()
            .describe(
              'Clé de la mémoire (ex: "color_preference", "vip_reason", "last_order")',
            ),
          value: z
            .any()
            .describe(
              'Valeur de la mémoire (peut être un objet JSON, texte, nombre, etc.)',
            ),
          expiresInDays: z
            .number()
            .optional()
            .describe('Nombre de jours avant expiration (optionnel)'),
        }),
      },
    );
  }

  /**
   * Retrieve persistent memories for a chat
   */
  private createRetrievePersistentMemoryTool() {
    return tool(
      async ({ chatId, type }, config?: any) => {
        try {
          // Get memories
          const memories = await this.prisma.getChatMemories(chatId, type);

          return JSON.stringify({
            success: true,
            memories: memories.map((m) => ({
              type: m.type,
              key: m.key,
              value: m.value,
              createdAt: m.createdAt,
              expiresAt: m.expiresAt,
            })),
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'retrieve_persistent_memory',
        description:
          "Récupérer les mémoires persistantes d'un client (préférences, notes VIP, commandes précédentes, etc.)",
        schema: z.object({
          chatId: z
            .string()
            .describe('ID du chat WhatsApp (format: 237xxx@c.us)'),
          type: z
            .enum(['PREFERENCE', 'VIP_NOTE', 'ORDER', 'CONTEXT'])
            .optional()
            .describe(
              'Type de mémoire à récupérer (optionnel, récupère tous les types si non spécifié)',
            ),
        }),
      },
    );
  }
}
