import { PrismaService } from '@app/prisma/prisma.service';
import { tool } from '@langchain/core/tools';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { instrumentTools } from '../tool-logging.util';

/**
 * Memory tools for the WhatsApp agent
 * Handles persistent memory storage and retrieval
 */
@Injectable()
export class MemoryTools {
  private readonly logger = new Logger(MemoryTools.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create all memory tools
   */
  createTools() {
    const tools = [
      this.createSavePersistentMemoryTool(),
      this.createRetrievePersistentMemoryTool(),
    ];

    return instrumentTools(this.logger, MemoryTools.name, tools);
  }

  /**
   * Save a persistent memory for a chat
   */
  private createSavePersistentMemoryTool() {
    return tool(
      async ({ type, key, value, expiresInDays }, config?: any) => {
        try {
          const chatId = config?.context?.chatId;
          if (!chatId) {
            return JSON.stringify({
              success: false,
              error: 'No chatId in runtime context',
            });
          }

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
          'Save an important persistent memory for the current conversation (customer preference, VIP note, order info, etc.). This information will be available in future conversations.',
        schema: z.object({
          type: z
            .enum(['PREFERENCE', 'VIP_NOTE', 'ORDER', 'CONTEXT'])
            .describe(
              'Memory type: PREFERENCE (customer preference), VIP_NOTE (VIP note), ORDER (order), CONTEXT (context)',
            ),
          key: z
            .string()
            .describe(
              'Memory key (e.g. "color_preference", "vip_reason", "last_order")',
            ),
          value: z
            .any()
            .describe(
              'Memory value (can be a JSON object, text, number, etc.)',
            ),
          expiresInDays: z
            .number()
            .optional()
            .describe('Number of days before expiration (optional)'),
        }),
      },
    );
  }

  /**
   * Retrieve persistent memories for a chat
   */
  private createRetrievePersistentMemoryTool() {
    return tool(
      async ({ type }, config?: any) => {
        try {
          const chatId = config?.context?.chatId;
          if (!chatId) {
            return JSON.stringify({
              success: false,
              error: 'No chatId in runtime context',
            });
          }

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
          'Retrieve persistent memories for the current conversation (preferences, VIP notes, past orders, etc.).',
        schema: z.object({
          type: z
            .enum(['PREFERENCE', 'VIP_NOTE', 'ORDER', 'CONTEXT'])
            .optional()
            .describe(
              'Memory type to retrieve (optional, returns all types if not specified)',
            ),
        }),
      },
    );
  }
}
