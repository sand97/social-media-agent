import { Module } from '@nestjs/common';

import { BackendClientModule } from '../backend-client/backend-client.module';
import { LangChainModule } from '../langchain/langchain.module';

import { WebhookController } from './webhook.controller';

@Module({
  imports: [LangChainModule, BackendClientModule],
  controllers: [WebhookController],
})
export class WebhookModule {}
