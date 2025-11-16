import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppAgentModule } from '../whatsapp-agent/whatsapp-agent.module';
import { ConnectorClientModule } from '../connector-client/connector-client.module';

@Module({
  imports: [PrismaModule, WhatsAppAgentModule, ConnectorClientModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
