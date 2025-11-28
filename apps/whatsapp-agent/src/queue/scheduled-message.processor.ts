import { PrismaService } from '@app/prisma/prisma.service';
import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';

/**
 * Processor for scheduled messages
 * This will be called when a scheduled message is due to be sent
 */
@Processor('scheduled-messages')
export class ScheduledMessageProcessor {
  private readonly logger = new Logger(ScheduledMessageProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process('send-reminder')
  async handleScheduledMessage(job: Job) {
    const { chatId, scheduledFor, context } = job.data;

    try {
      this.logger.log(
        `Processing scheduled message for ${chatId} (scheduled for ${scheduledFor})`,
      );

      // Update database status
      const scheduled = await this.prisma.scheduledMessage.findFirst({
        where: {
          chatId,
          jobId: job.id.toString(),
          status: 'pending',
        },
      });

      if (!scheduled) {
        this.logger.warn(
          `Scheduled message not found or already processed: ${job.id}`,
        );
        return;
      }

      // TODO: Implement the actual logic here
      // This should:
      // 1. Check the intent (context.intentToCheck)
      // 2. If intent is false, perform context.actionIfFalse
      // 3. Generate and send an appropriate message via the LangChain agent

      // For now, just log it
      this.logger.log(`Reminder context: ${JSON.stringify(context)}`);
      this.logger.log(
        `TODO: Implement agent logic to check intent and send appropriate message`,
      );

      // Update status
      await this.prisma.scheduledMessage.update({
        where: { id: scheduled.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
        },
      });

      this.logger.log(`✅ Processed scheduled message for ${chatId}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to process scheduled message for ${chatId}:`,
        error.message,
      );
      throw error; // This will trigger retry
    }
  }
}
