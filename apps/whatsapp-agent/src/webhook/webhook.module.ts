import { Module } from '@nestjs/common';

import { BackendClientModule } from '../backend-client/backend-client.module';
import { CatalogModule } from '../catalog/catalog.module';
import { ConnectorModule } from '../connector/connector.module';
import { ImageProcessingModule } from '../image-processing/image-processing.module';
import { LangChainModule } from '../langchain/langchain.module';
import { MediaModule } from '../media/media.module';
import { ToolsModule } from '../tools/tools.module';

import { AudioMessageHandlerService } from './handlers/audio-message-handler.service';
import { ImageMessageHandlerService } from './handlers/image-message-handler.service';
import { PairingSuccessHandlerService } from './handlers/pairing-success-handler.service';
import { TextMessageHandlerService } from './handlers/text-message-handler.service';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [
    LangChainModule,
    BackendClientModule,
    CatalogModule,
    ConnectorModule,
    MediaModule,
    ImageProcessingModule,
    ToolsModule,
  ],
  controllers: [WebhookController],
  providers: [
    TextMessageHandlerService,
    AudioMessageHandlerService,
    ImageMessageHandlerService,
    PairingSuccessHandlerService,
  ],
})
export class WebhookModule {}
