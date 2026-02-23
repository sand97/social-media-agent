import { HttpModule } from '@nestjs/axios';
import { Module, forwardRef } from '@nestjs/common';

import { CommonModule } from '../common/common.module';
import { ConnectorClientModule } from '../connector-client/connector-client.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { PageScriptModule } from '../page-scripts/page-script.module';
import { PrismaModule } from '../prisma/prisma.module';

import { UserSyncService } from './user-sync.service';
import { WhatsAppAgentClientService } from './whatsapp-agent-client.service';
import {
  WhatsAppAgentController,
  AgentController,
} from './whatsapp-agent.controller';
import { WhatsAppAgentInternalController } from './whatsapp-agent-internal.controller';
import { WhatsAppAgentInternalService } from './whatsapp-agent-internal.service';
import { WhatsAppAgentService } from './whatsapp-agent.service';

@Module({
  imports: [
    PrismaModule,
    CommonModule,
    HttpModule,
    ConnectorClientModule,
    PageScriptModule,
    forwardRef(() => OnboardingModule),
  ],
  controllers: [
    WhatsAppAgentController,
    AgentController,
    WhatsAppAgentInternalController,
  ],
  providers: [
    WhatsAppAgentService,
    UserSyncService,
    WhatsAppAgentClientService,
    WhatsAppAgentInternalService,
  ],
  exports: [WhatsAppAgentService, UserSyncService, WhatsAppAgentClientService],
})
export class WhatsAppAgentModule {}
