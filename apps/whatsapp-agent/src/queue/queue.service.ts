import { PrismaService } from '@app/prisma/prisma.service';
import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bull';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue('scheduled-messages') private scheduledMessagesQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Schedule a message for later
   * @param chatId - WhatsApp chat ID
   * @param scheduledFor - When to send the message
   * @param context - Context for the message (reason, intent to check, action)
   */
  async scheduleMessage(
    chatId: string,
    scheduledFor: Date,
    context: {
      reason: string;
      intentToCheck: string;
      actionIfFalse: string;
    },
  ) {
    try {
      // Calculate delay
      const delay = scheduledFor.getTime() - Date.now();

      if (delay <= 0) {
        throw new Error('Scheduled time must be in the future');
      }

      // Add job to queue
      const job = await this.scheduledMessagesQueue.add(
        'send-reminder',
        {
          chatId,
          scheduledFor: scheduledFor.toISOString(),
          context,
        },
        {
          delay,
          jobId: `reminder-${chatId}-${scheduledFor.getTime()}`,
        },
      );

      // Save to database
      const scheduled = await this.prisma.scheduledMessage.create({
        data: {
          chatId,
          scheduledFor,
          context,
          jobId: job.id.toString(),
          status: 'pending',
        },
      });

      this.logger.log(
        `✅ Scheduled message for ${chatId} at ${scheduledFor.toISOString()}`,
      );

      return {
        success: true,
        scheduledId: scheduled.id,
        jobId: job.id.toString(),
      };
    } catch (error: any) {
      this.logger.error('Failed to schedule message:', error.message);
      throw error;
    }
  }

  /**
   * Cancel a scheduled message
   * @param scheduledId - ID of the scheduled message
   */
  async cancelScheduledMessage(scheduledId: string) {
    try {
      const scheduled = await this.prisma.scheduledMessage.findUnique({
        where: { id: scheduledId },
      });

      if (!scheduled) {
        throw new Error('Scheduled message not found');
      }

      if (scheduled.status !== 'pending') {
        throw new Error('Message already sent or cancelled');
      }

      // Remove job from queue
      if (scheduled.jobId) {
        const job = await this.scheduledMessagesQueue.getJob(scheduled.jobId);
        if (job) {
          await job.remove();
        }
      }

      // Update status in database
      await this.prisma.scheduledMessage.update({
        where: { id: scheduledId },
        data: { status: 'cancelled' },
      });

      this.logger.log(`✅ Cancelled scheduled message: ${scheduledId}`);

      return { success: true };
    } catch (error: any) {
      this.logger.error('Failed to cancel scheduled message:', error.message);
      throw error;
    }
  }

  /**
   * Get all pending scheduled messages for a chat
   * @param chatId - WhatsApp chat ID
   */
  async getPendingScheduledMessages(chatId: string) {
    return await this.prisma.scheduledMessage.findMany({
      where: {
        chatId,
        status: 'pending',
        scheduledFor: {
          gt: new Date(),
        },
      },
      orderBy: {
        scheduledFor: 'asc',
      },
    });
  }

  /**
   * Clean old completed scheduled messages (older than 30 days)
   */
  async cleanOldScheduledMessages() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.prisma.scheduledMessage.deleteMany({
      where: {
        status: {
          in: ['sent', 'cancelled'],
        },
        updatedAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    this.logger.log(`🗑️ Cleaned ${result.count} old scheduled messages`);

    return result.count;
  }
}
