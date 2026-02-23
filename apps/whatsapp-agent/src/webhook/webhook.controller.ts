import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AudioMessageHandlerService } from './handlers/audio-message-handler.service';
import { ImageMessageHandlerService } from './handlers/image-message-handler.service';
import { PairingSuccessHandlerService } from './handlers/pairing-success-handler.service';
import { TextMessageHandlerService } from './handlers/text-message-handler.service';

@ApiTags('Webhook')
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly textMessageHandler: TextMessageHandlerService,
    private readonly audioMessageHandler: AudioMessageHandlerService,
    private readonly imageMessageHandler: ImageMessageHandlerService,
    private readonly pairingSuccessHandler: PairingSuccessHandlerService,
  ) {}

  @Post('message')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Receive WhatsApp events from connector',
    description:
      'This endpoint receives all WhatsApp events from the connector service',
  })
  @ApiResponse({
    status: 200,
    description: 'Event received successfully',
  })
  async handleEvent(@Body() payload: any) {
    const { event, timestamp, data, userId } = payload;

    this.logger.debug(`Received event: ${event}`, { timestamp, userId });

    try {
      if (event === 'message') {
        const [message] = data || [];

        const isAudio =
          message?.type === 'ptt' ||
          message?.type === 'audio' ||
          message?.downloadedMedia?.mimetype?.startsWith?.('audio');

        if (isAudio) {
          await this.audioMessageHandler.handleInline(data, userId);
          return { success: true, event, processed: true, mode: 'inline' };
        }

        const isImage =
          message?.type === 'image' ||
          message?.downloadedMedia?.mimetype?.startsWith?.('image');

        if (isImage) {
          await this.imageMessageHandler.handleInline(data, userId);
          return { success: true, event, processed: true, mode: 'inline' };
        }

        await this.textMessageHandler.handle(data, userId);

        return { success: true, event, processed: true };
      }

      if (event === 'pairing_success') {
        await this.pairingSuccessHandler.handle(data);
        return { success: true, event, processed: true };
      }

      this.logger.log(`Event received: ${event}`, {
        event,
        timestamp,
        dataLength: data?.length || 0,
      });

      return {
        success: true,
        event,
        processed: false,
      };
    } catch (error: any) {
      this.logger.error(`Error handling event ${event}:`, error.message);
      return {
        success: false,
        event,
        error: error.message,
      };
    }
  }
}
