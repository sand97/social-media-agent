import { Module } from '@nestjs/common';

import { CommonModule } from '../common/common.module';
import { PrismaModule } from '../prisma/prisma.module';

import { WhatsAppAgentController } from './whatsapp-agent.controller';
import { WhatsAppAgentService } from './whatsapp-agent.service';

@Module({
  imports: [PrismaModule, CommonModule],
  controllers: [WhatsAppAgentController],
  providers: [WhatsAppAgentService],
  exports: [WhatsAppAgentService],
})
export class WhatsAppAgentModule {}
