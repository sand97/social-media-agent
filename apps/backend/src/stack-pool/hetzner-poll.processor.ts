import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bull';

import {
  HETZNER_POLL_DEFAULT_DELAY_MS,
  HETZNER_POLL_JOB,
  HETZNER_POLL_QUEUE,
} from './hetzner-poll.constants';
import { StackPoolService } from './stack-pool.service';

export interface HetznerPollJobData {
  workflowId: string;
}

@Processor(HETZNER_POLL_QUEUE)
export class HetznerPollProcessor {
  private readonly logger = new Logger(HetznerPollProcessor.name);

  constructor(
    private readonly stackPoolService: StackPoolService,
    @InjectQueue(HETZNER_POLL_QUEUE)
    private readonly hetznerPollQueue: Queue<HetznerPollJobData>,
  ) {}

  @Process(HETZNER_POLL_JOB)
  async handlePollJob(job: Job<HetznerPollJobData>): Promise<void> {
    const { workflowId } = job.data;

    this.logger.log(`[hetzner_poll] processing workflow=${workflowId}`);

    const stillPending =
      await this.stackPoolService.advanceHetznerInitialization(workflowId);

    if (stillPending) {
      await this.hetznerPollQueue.add(
        HETZNER_POLL_JOB,
        { workflowId },
        {
          delay: HETZNER_POLL_DEFAULT_DELAY_MS,
          removeOnComplete: true,
          removeOnFail: 50,
        },
      );

      this.logger.log(
        `[hetzner_poll] re-queued workflow=${workflowId} delay=${HETZNER_POLL_DEFAULT_DELAY_MS}ms`,
      );
    } else {
      this.logger.log(`[hetzner_poll] done workflow=${workflowId}`);
    }
  }
}
