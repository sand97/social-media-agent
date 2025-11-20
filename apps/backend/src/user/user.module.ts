import { Module } from '@nestjs/common';

import { ConnectorClientModule } from '../connector-client/connector-client.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppAgentModule } from '../whatsapp-agent/whatsapp-agent.module';

import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [PrismaModule, WhatsAppAgentModule, ConnectorClientModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
