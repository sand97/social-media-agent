import { Body, Controller, Post, Logger, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { lastValueFrom } from 'rxjs';

import { BackendClientService } from '../backend-client/backend-client.service';
import { LangChainAgentService } from '../langchain/langchain-agent.service';

@ApiTags('Webhook')
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly agentService: LangChainAgentService,
    private readonly backendClient: BackendClientService,
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
    const { event, timestamp, data } = payload;

    this.logger.debug(`Received event: ${event}`, { timestamp });

    try {
      // Traiter les messages entrants
      if (event === 'message') {
        await this.agentService.processIncomingMessage(data);
      }

      // Traiter l'événement de pairing réussi (événement custom du connector)
      else if (event === 'pairing_success') {
        this.logger.log('WhatsApp pairing successful', {
          phoneNumber: data?.phoneNumber,
          profile: data?.profile,
        });

        // Notifier le backend que le pairing a réussi
        try {
          const phoneNumber = data?.phoneNumber;
          const whatsappProfile = data?.profile || {};

          if (!phoneNumber) {
            this.logger.warn(
              'Pairing success event received without phone number',
            );
            return {
              success: false,
              event,
              error: 'Missing phone number in pairing_success event',
            };
          }

          // Appeler le backend pour finaliser le pairing
          await lastValueFrom(
            this.backendClient.verifyPairingSuccess(
              phoneNumber,
              whatsappProfile,
            ),
          );

          this.logger.log(
            `Backend notified of successful pairing for ${phoneNumber}`,
          );
        } catch (backendError: any) {
          this.logger.error(
            'Failed to notify backend of pairing:',
            backendError.message,
          );
          // Ne pas faire échouer le webhook si le backend n'est pas joignable
        }
      }

      // Pour les autres événements, on log simplement
      else {
        this.logger.log(`Event received: ${event}`, {
          event,
          timestamp,
          dataLength: data?.length || 0,
        });
      }

      return {
        success: true,
        event,
        processed: event === 'message' || event === 'pairing_success',
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
