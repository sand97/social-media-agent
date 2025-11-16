import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ExecuteMethodDto } from './dto/execute-method.dto';
import { RequestPairingCodeDto } from './dto/request-pairing-code.dto';
import { SetWebhooksDto } from './dto/set-webhooks.dto';
import { WebhookService } from './webhook.service';
import { WhatsAppClientService } from './whatsapp-client.service';

@ApiTags('WhatsApp')
@Controller('whatsapp')
export class WhatsAppController {
  constructor(
    private readonly whatsappClientService: WhatsAppClientService,
    private readonly webhookService: WebhookService,
  ) {}

  @Post('execute')
  @ApiOperation({
    summary: 'Exécuter une méthode du client WhatsApp',
    description:
      "Endpoint générique pour exécuter n'importe quelle méthode disponible sur le client whatsapp-web.js",
  })
  @ApiResponse({
    status: 200,
    description: 'Méthode exécutée avec succès',
  })
  @ApiResponse({
    status: 400,
    description: 'Méthode invalide ou paramètres incorrects',
  })
  async executeMethod(@Body() dto: ExecuteMethodDto) {
    try {
      const result = await this.whatsappClientService.executeMethod(
        dto.method,
        dto.parameters || [],
      );

      return {
        success: true,
        method: dto.method,
        result,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          method: dto.method,
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('status')
  @ApiOperation({
    summary: 'Récupérer le statut du client WhatsApp',
    description:
      "Retourne l'état actuel du client (prêt, QR code disponible, etc.)",
  })
  @ApiResponse({
    status: 200,
    description: 'Statut récupéré avec succès',
  })
  getStatus() {
    return this.whatsappClientService.getStatus();
  }

  @Get('qr')
  @ApiOperation({
    summary: 'Récupérer le QR code',
    description:
      'Retourne le QR code actuel si disponible (pour authentification)',
  })
  @ApiResponse({
    status: 200,
    description: 'QR code disponible',
  })
  @ApiResponse({
    status: 404,
    description: 'Aucun QR code disponible',
  })
  getQrCode() {
    const qrCode = this.whatsappClientService.getQrCode();

    if (!qrCode) {
      throw new HttpException(
        {
          success: false,
          message: 'No QR code available. Client may already be authenticated.',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      success: true,
      qrCode,
    };
  }

  @Get('webhooks')
  @ApiOperation({
    summary: 'Récupérer la liste des webhooks configurés',
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des webhooks',
  })
  getWebhooks() {
    return {
      success: true,
      webhooks: this.webhookService.getWebhookUrls(),
    };
  }

  @Post('webhooks')
  @ApiOperation({
    summary: 'Configurer les URLs de webhooks',
    description:
      'Met à jour la liste des URLs qui recevront les événements WhatsApp',
  })
  @ApiResponse({
    status: 200,
    description: 'Webhooks configurés avec succès',
  })
  setWebhooks(@Body() dto: SetWebhooksDto) {
    this.webhookService.setWebhookUrls(dto.urls);

    return {
      success: true,
      message: `${dto.urls.length} webhook(s) configured`,
      webhooks: dto.urls,
    };
  }

  @Post('request-pairing-code')
  @ApiOperation({
    summary: 'Request a pairing code for phone number authentication',
    description:
      'Generates a pairing code that can be used to authenticate WhatsApp using a phone number instead of QR code',
  })
  @ApiResponse({
    status: 200,
    description: 'Pairing code generated successfully',
    schema: {
      example: {
        success: true,
        code: 'ABCD1234',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Failed to generate pairing code',
  })
  async requestPairingCode(@Body() dto: RequestPairingCodeDto) {
    try {
      const code = await this.whatsappClientService.requestPairingCode(
        dto.phoneNumber,
      );

      return {
        success: true,
        code,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
