import { BackendClientModule } from '@app/backend-client/backend-client.module';
import { ConnectorModule } from '@app/connector/connector.module';
import { SecurityModule } from '@app/security/security.module';
import { ToolsModule } from '@app/tools/tools.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { WhatsAppAgentService } from './whatsapp-agent.service';

@Module({
  imports: [
    ConfigModule,
    ConnectorModule,
    BackendClientModule,
    SecurityModule,
    ToolsModule,
  ],
  providers: [WhatsAppAgentService],
  exports: [WhatsAppAgentService],
})
export class LangChainModule {}
