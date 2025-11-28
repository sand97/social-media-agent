import { PrismaClient } from '@app/generated/client';
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: ['warn', 'error'],
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ Database connected successfully');
    } catch (error: any) {
      this.logger.error('❌ Failed to connect to database:', error.message);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('🔌 Database disconnected');
  }

  /**
   * Clean expired memories
   */
  async cleanExpiredMemories() {
    const result = await this.conversationMemory.deleteMany({
      where: {
        expiresAt: {
          lte: new Date(),
        },
      },
    });
    return result.count;
  }

  /**
   * Get or create conversation memory
   */
  async getOrCreateMemory(chatId: string, type: string, key: string) {
    return await this.conversationMemory.findFirst({
      where: { chatId, type: type as any, key },
    });
  }

  /**
   * Save or update conversation memory
   */
  async saveMemory(
    chatId: string,
    type: string,
    key: string,
    value: any,
    expiresAt?: Date,
  ) {
    return await this.conversationMemory.upsert({
      where: {
        // Note: This requires a unique constraint on chatId+type+key
        // For now we'll use deleteMany + create
        id: '',
      },
      create: {
        chatId,
        type: type as any,
        key,
        value,
        expiresAt,
      },
      update: {
        value,
        expiresAt,
      },
    });
  }

  /**
   * Get all memories for a chat
   */
  async getChatMemories(chatId: string, type?: string) {
    return await this.conversationMemory.findMany({
      where: {
        chatId,
        ...(type && { type: type as any }),
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
