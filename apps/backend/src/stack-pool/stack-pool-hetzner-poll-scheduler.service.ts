import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bull';

import {
  HETZNER_POLL_DEFAULT_DELAY_MS,
  HETZNER_POLL_JOB,
  HETZNER_POLL_QUEUE,
} from './hetzner-poll.constants';
import type { HetznerPollJobData } from './hetzner-poll.processor';

@Injectable()
export class StackPoolHetznerPollSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(
    StackPoolHetznerPollSchedulerService.name,
  );

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue(HETZNER_POLL_QUEUE)
    private readonly hetznerPollQueue: Queue<HetznerPollJobData>,
  ) {}

  /**
   * On boot, clean stale repeatable jobs left by the old scheduler
   * and re-enqueue any orphaned workflows discovered by the caller.
   */
  async onModuleInit(): Promise<void> {
    // Remove any stale repeatable jobs from previous implementation
    const existingRepeatables = await this.hetznerPollQueue.getRepeatableJobs();
    for (const job of existingRepeatables) {
      await this.hetznerPollQueue.removeRepeatableByKey(job.key);
    }

    if (existingRepeatables.length > 0) {
      this.logger.log(
        `Cleaned ${existingRepeatables.length} stale repeatable job(s) from previous runs`,
      );
    }

    this.logger.log('Hetzner poll scheduler ready (on-demand mode)');
  }

  /**
   * Enqueue a poll job for a specific workflow.
   * Called by StackPoolService after creating a Hetzner server.
   */
  async enqueueHetznerPoll(workflowId: string): Promise<void> {
    const delayMs = this.getPollDelayMs();

    await this.hetznerPollQueue.add(
      HETZNER_POLL_JOB,
      { workflowId },
      {
        delay: delayMs,
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );

    this.logger.log(
      `[enqueue_hetzner_poll] workflow=${workflowId} delay=${delayMs}ms`,
    );
  }

  private getPollDelayMs(): number {
    const value = this.configService.get<string>(
      'STACK_POOL_HETZNER_POLL_INTERVAL_MS',
      String(HETZNER_POLL_DEFAULT_DELAY_MS),
    );
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : HETZNER_POLL_DEFAULT_DELAY_MS;
  }
}
