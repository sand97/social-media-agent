import { CommonModule } from '@app/common/common.module';
import { ConnectorClientModule } from '@app/connector-client';
import { PrismaModule } from '@app/prisma/prisma.module';
import { BullModule } from '@nestjs/bull';
import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { CloudflareDnsService } from './cloudflare-dns.service';
import { HetznerCloudService } from './hetzner-cloud.service';
import { HETZNER_POLL_QUEUE } from './hetzner-poll.constants';
import { HetznerPollProcessor } from './hetzner-poll.processor';
import { StackPoolHetznerPollSchedulerService } from './stack-pool-hetzner-poll-scheduler.service';
import {
  InfraStackPoolController,
  StackPoolWorkflowsController,
} from './stack-pool.controller';
import { StackPoolService } from './stack-pool.service';

@Module({
  imports: [
    PrismaModule,
    CommonModule,
    ConnectorClientModule,
    forwardRef(() => AuthModule),
    BullModule.registerQueue({
      name: HETZNER_POLL_QUEUE,
    }),
  ],
  controllers: [InfraStackPoolController, StackPoolWorkflowsController],
  providers: [
    StackPoolService,
    CloudflareDnsService,
    HetznerCloudService,
    StackPoolHetznerPollSchedulerService,
    HetznerPollProcessor,
  ],
  exports: [StackPoolService],
})
export class StackPoolModule {}
