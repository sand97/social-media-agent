import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ExecuteMethodDto } from './dto/execute-method.dto';
import { ExecutePageScriptDto } from './dto/execute-page-script.dto';
import { RequestPairingCodeDto } from './dto/request-pairing-code.dto';
import { SendMessageDto } from './dto/send-message.dto';
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

  @Post('execute-script')
  @ApiOperation({
    summary: 'Exécuter du code JavaScript dans la page WhatsApp Web',
    description:
      "Permet d'exécuter du code JavaScript arbitraire dans le contexte de la page WhatsApp Web (accès à window.WPP, etc.)",
  })
  @ApiResponse({
    status: 200,
    description: 'Script exécuté avec succès',
    schema: {
      example: {
        success: true,
        result: { collections: [], products: [] },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "Client non prêt ou erreur d'exécution",
  })
  async executePageScript(@Body() dto: ExecutePageScriptDto) {
    try {
      const result = await this.whatsappClientService.executePageScript(
        dto.script,
      );

      return {
        success: true,
        result,
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

  @Post('send-message')
  @ApiOperation({
    summary: 'Envoyer un message WhatsApp',
    description:
      'Envoie un message texte à un chat WhatsApp. Compatible avec le client whatsapp-agent.',
  })
  @ApiResponse({
    status: 200,
    description: 'Message envoyé avec succès',
  })
  @ApiResponse({
    status: 400,
    description: "Erreur d'envoi du message",
  })
  async sendMessage(@Body() dto: SendMessageDto) {
    try {
      const parameters = dto.quotedMessageId
        ? [dto.to, dto.message, { quotedMessageId: dto.quotedMessageId }]
        : [dto.to, dto.message];

      const result = await this.whatsappClientService.executeMethod(
        'sendMessage',
        parameters,
      );

      return {
        success: true,
        result: {
          id: result?.id?._serialized || result?.id || null,
          to: dto.to,
          timestamp: result?.timestamp ?? result?.t ?? null,
        },
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

  @Get('contact/:contactId')
  @ApiOperation({
    summary: 'Récupérer un contact WhatsApp par son ID',
    description:
      'Retourne les informations sérialisables du contact utiles au whatsapp-agent.',
  })
  @ApiResponse({
    status: 200,
    description: 'Contact récupéré avec succès',
  })
  @ApiResponse({
    status: 404,
    description: 'Contact introuvable',
  })
  async getContact(@Param('contactId') contactId: string) {
    try {
      return await this.whatsappClientService.getContactById(contactId);
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        error?.status || HttpStatus.NOT_FOUND,
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

  @Post('restart')
  @ApiOperation({
    summary: 'Redémarrer le client WhatsApp',
    description:
      'Force le redémarrage du client WhatsApp pour générer un nouveau QR code. Utile quand le QR code a expiré.',
  })
  @ApiResponse({
    status: 200,
    description: 'Client redémarré avec succès',
  })
  @ApiResponse({
    status: 500,
    description: 'Erreur lors du redémarrage',
  })
  async restartClient() {
    try {
      await this.whatsappClientService.restartClient();

      return {
        success: true,
        message:
          'WhatsApp client restarted successfully. New QR code will be emitted via webhook.',
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('clean-restart')
  @ApiOperation({
    summary: 'Nettoyer et redémarrer le client WhatsApp',
    description:
      'Supprime les dossiers .wwebjs_cache et data, puis redémarre le client pour repartir de zéro. À utiliser UNIQUEMENT lors de la première demande de connexion.',
  })
  @ApiResponse({
    status: 200,
    description: 'Client nettoyé et redémarré avec succès',
  })
  @ApiResponse({
    status: 500,
    description: 'Erreur lors du nettoyage',
  })
  async cleanAndRestartClient() {
    try {
      await this.whatsappClientService.cleanAndRestartClient();

      return {
        success: true,
        message:
          'WhatsApp client cleaned and restarted successfully. Ready for new authentication.',
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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
