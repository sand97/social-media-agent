import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { WebhookService } from './webhook.service';
import { WhatsAppClientService } from './whatsapp-client.service';
import { WhatsAppController } from './whatsapp.controller';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  controllers: [WhatsAppController],
  providers: [WhatsAppClientService, WebhookService],
  exports: [WhatsAppClientService, WebhookService],
})
export class WhatsAppModule {}
