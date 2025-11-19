import { Body, Controller, Post, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';

class WhatsAppConnectedDto {
  phoneNumber: string;
  profile: any;
  id: string;
}

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('whatsapp/connected')
  @ApiOperation({
    summary: 'Webhook appelé quand WhatsApp se connecte',
    description:
      'Endpoint appelé par le whatsapp-connector quand le client WhatsApp est prêt',
  })
  @ApiResponse({
    status: 200,
    description: 'Connexion traitée avec succès',
  })
  async whatsappConnected(@Body() data: WhatsAppConnectedDto) {
    this.logger.log(`WhatsApp connected for: ${data.phoneNumber}`);

    try {
      // Appeler le service d'auth pour compléter le pairing
      // Note: The AuthService will automatically trigger user data synchronization
      // (profile, business info, catalog) in the background
      const result = await this.authService.verifyPairingSuccess(
        data.phoneNumber,
        {
          profile: data.profile,
        },
      );

      this.logger.log(
        `Pairing verified for user: ${result.user.id} (${result.user.phoneNumber})`,
      );

      return {
        success: true,
        message: 'WhatsApp connection processed successfully',
        userId: result.user.id,
      };
    } catch (error: any) {
      this.logger.error(
        `Error processing WhatsApp connection: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        error: error.message,
      };
    }
  }

}
