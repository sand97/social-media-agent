import { Module } from '@nestjs/common';
import { WhatsAppAgentService } from './whatsapp-agent.service';
import { WhatsAppAgentController } from './whatsapp-agent.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [PrismaModule, CommonModule],
  controllers: [WhatsAppAgentController],
  providers: [WhatsAppAgentService],
  exports: [WhatsAppAgentService],
})
export class WhatsAppAgentModule {}
