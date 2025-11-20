import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ConnectorModule } from '../connector/connector.module';

import { LangChainAgentService } from './langchain-agent.service';

@Module({
  imports: [ConfigModule, ConnectorModule],
  providers: [LangChainAgentService],
  exports: [LangChainAgentService],
})
export class LangChainModule {}
