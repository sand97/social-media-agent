import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [AuthModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
