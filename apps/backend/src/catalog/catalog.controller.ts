import {
  Controller,
  Post,
  Body,
  BadRequestException,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { CatalogUploadGuard } from '../common/guards/catalog-upload.guard';
import { ClientId } from '../common/decorators/client-id.decorator';
import type { CatalogData, ClientInfoData } from './types/catalog.types';

@ApiTags('Catalog')
@Controller('catalog')
export class CatalogController {
  private readonly logger = new Logger(CatalogController.name);

  constructor(private readonly catalogService: CatalogService) {}

  @Post('upload-image')
  @UseGuards(CatalogUploadGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Upload une image de produit depuis le connector',
    description:
      'Endpoint appelé par le script exécuté dans le connector pour uploader les images des produits. Le clientId est extrait du token JWT pour des raisons de sécurité. Accepte les données en base64 (JSON) depuis nodeFetch.',
  })
  @ApiResponse({
    status: 200,
    description: 'Image uploadée avec succès',
    schema: {
      example: {
        success: true,
        url: 'https://files-flemme.bedones.com/whatsapp-agent/237697020290/catalog/images/849641504281228/25095720553426064-0.jpg',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Erreur lors de l\'upload',
  })
  @ApiResponse({
    status: 401,
    description: 'Token invalide ou expiré',
  })
  async uploadImage(
    @ClientId() clientId: string, // Extrait du token JWT
    @Body('image') imageBase64: string,
    @Body('filename') filename: string,
    @Body('productId') productId: string,
    @Body('collectionId') collectionId: string,
    @Body('imageIndex') imageIndex: string,
    @Body('imageType') imageType: string,
    @Body('originalUrl') originalUrl?: string,
  ) {
    if (!imageBase64 || !filename) {
      throw new BadRequestException('Missing image data or filename');
    }

    if (!productId || !collectionId || !imageIndex) {
      throw new BadRequestException('Missing required fields');
    }

    this.logger.debug(
      `Receiving image (base64): client=${clientId}, product=${productId}, collection=${collectionId}, index=${imageIndex}`,
    );

    // Convertir base64 en Buffer
    // Format: "data:image/jpeg;base64,/9j/4AAQ..."
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const result = await this.catalogService.uploadProductImage(
      buffer,
      productId,
      collectionId,
      clientId,
      parseInt(imageIndex, 10),
      imageType || 'unknown',
      filename,
    );

    if (!result.success) {
      throw new BadRequestException(result.error || 'Upload failed');
    }

    return {
      success: true,
      url: result.url,
      metadata: {
        productId,
        collectionId,
        imageIndex: parseInt(imageIndex, 10),
        imageType,
        originalUrl,
      },
    };
  }

  @Post('upload-avatar')
  @UseGuards(CatalogUploadGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Upload l\'avatar du compte WhatsApp',
    description:
      'Endpoint appelé par le script exécuté dans le connector pour uploader l\'avatar du compte. Le clientId est extrait du token JWT. Accepte les données en base64 (JSON) depuis nodeFetch.',
  })
  @ApiResponse({
    status: 200,
    description: 'Avatar uploadé avec succès',
  })
  async uploadAvatar(
    @ClientId() clientId: string,
    @Body('avatar') avatarBase64: string,
    @Body('filename') filename: string,
    @Body('originalUrl') originalUrl?: string,
  ) {
    if (!avatarBase64 || !filename) {
      throw new BadRequestException('Missing avatar data or filename');
    }

    this.logger.debug(`Receiving avatar (base64) for client: ${clientId}`);

    // Convertir base64 en Buffer
    const base64Data = avatarBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const result = await this.catalogService.uploadAvatar(
      buffer,
      clientId,
      filename,
    );

    if (!result.success) {
      throw new BadRequestException(result.error || 'Upload failed');
    }

    return {
      success: true,
      url: result.url,
      metadata: {
        originalUrl,
      },
    };
  }

  @Post('save-client-info')
  @UseGuards(CatalogUploadGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Sauvegarde les informations du client WhatsApp',
    description:
      'Endpoint appelé par le script pour sauvegarder les informations du compte WhatsApp Business.',
  })
  @ApiResponse({
    status: 200,
    description: 'Informations sauvegardées avec succès',
  })
  async saveClientInfo(
    @ClientId() clientId: string,
    @Body() clientInfo: ClientInfoData,
  ) {
    this.logger.debug(`Saving client info for: ${clientId}`);

    const result = await this.catalogService.saveClientInfo(clientId, clientInfo);

    if (!result.success) {
      throw new BadRequestException(result.error || 'Save failed');
    }

    return {
      success: true,
      message: 'Client info saved successfully',
    };
  }

  @Post('save-catalog')
  @UseGuards(CatalogUploadGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Sauvegarde le catalogue (collections et produits)',
    description:
      'Endpoint appelé par le script pour sauvegarder le catalogue complet avec les collections et produits.',
  })
  @ApiResponse({
    status: 200,
    description: 'Catalogue sauvegardé avec succès',
  })
  async saveCatalog(
    @ClientId() clientId: string,
    @Body() catalogData: CatalogData,
  ) {
    this.logger.debug(`Saving catalog for: ${clientId}`);

    const result = await this.catalogService.saveCatalog(clientId, catalogData);

    if (!result.success) {
      throw new BadRequestException(result.error || 'Save failed');
    }

    return {
      success: true,
      message: 'Catalog saved successfully',
      stats: result.stats,
    };
  }
}
