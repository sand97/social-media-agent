import {
  Controller,
  Post,
  Get,
  Body,
  BadRequestException,
  Logger,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { ClientId } from '../common/decorators/client-id.decorator';
import { CatalogUploadGuard } from '../common/guards/catalog-upload.guard';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

import { CatalogService } from './catalog.service';
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
        url: 'https://files-flemme.bedones.com/whatsapp-agent/cmd2a8ykg0004uh5f2cn5u4w1/catalog/images/849641504281228/25095720553426064-0.jpg',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "Erreur lors de l'upload",
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
      this.logger.error(
        `❌ Upload failed for product ${productId}, index ${imageIndex}: ${result.error}`,
      );
      throw new BadRequestException(result.error || 'Upload failed');
    }

    this.logger.log(
      `✅ Image uploaded successfully: product=${productId}, index=${imageIndex}`,
    );
    this.logger.log(`   URL Minio: ${result.url}`);
    if (originalUrl) {
      this.logger.log(`   URL WhatsApp: ${originalUrl}`);
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
    summary: "Upload l'avatar du compte WhatsApp",
    description:
      "Endpoint appelé par le script exécuté dans le connector pour uploader l'avatar du compte. Le clientId est extrait du token JWT. Accepte les données en base64 (JSON) depuis nodeFetch.",
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

    const result = await this.catalogService.saveClientInfo(
      clientId,
      clientInfo,
    );

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

  @Post('delete-images')
  @UseGuards(CatalogUploadGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Supprime des images obsolètes',
    description:
      'Endpoint appelé par le script pour supprimer les images qui ne sont plus dans le catalogue WhatsApp. Supprime les fichiers de Minio et les entrées de la BD.',
  })
  @ApiResponse({
    status: 200,
    description: 'Images supprimées avec succès',
    schema: {
      example: {
        success: true,
        deletedCount: 5,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Erreur lors de la suppression',
  })
  @ApiResponse({
    status: 401,
    description: 'Token invalide ou expiré',
  })
  async deleteImages(
    @ClientId() clientId: string,
    @Body('imageIds') imageIds: string[],
  ) {
    this.logger.debug(
      `Deleting ${imageIds?.length || 0} images for: ${clientId}`,
    );

    if (!imageIds || !Array.isArray(imageIds)) {
      throw new BadRequestException('imageIds must be an array');
    }

    const result = await this.catalogService.deleteImages(imageIds);

    if (!result.success) {
      throw new BadRequestException(result.error || 'Delete failed');
    }

    return {
      success: true,
      deletedCount: result.deletedCount,
    };
  }

  @Post('force-sync')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Force catalog synchronization',
    description:
      'Triggers full catalog sync: backend (via connector) + whatsapp-agent (local with embeddings). Updates lastCatalogSyncedAt.',
  })
  @ApiResponse({
    status: 200,
    description: 'Sync completed successfully',
    schema: {
      example: {
        success: true,
        backendSync: { success: true },
        agentSync: { success: true, message: 'Sync completed' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT required',
  })
  @ApiResponse({
    status: 400,
    description: 'Sync failed',
    schema: {
      example: {
        success: false,
        error: 'WhatsApp agent not configured',
      },
    },
  })
  async forceCatalogSync(@Req() req: any) {
    const userId = req.user.id; // Extract from JWT
    this.logger.log(`Force sync requested by user: ${userId}`);

    const result = await this.catalogService.forceCatalogSync(userId);

    if (!result.success) {
      throw new BadRequestException(result.error || 'Sync failed');
    }

    return result;
  }

  @Get('image-sync-status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get image sync status',
    description:
      "Endpoint frontend (dashboard catalogue) pour afficher l'état de la synchronisation asynchrone des images (SYNCING/DONE/FAILED) après un force-sync.",
  })
  @ApiResponse({
    status: 200,
    description: 'Image sync status retrieved successfully',
  })
  async getImageSyncStatus(@Req() req: any) {
    const userId = req.user.id;
    const status = await this.catalogService.getImageSyncStatus(userId);

    if (!status) {
      throw new BadRequestException('WhatsApp agent not configured');
    }

    return status;
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Récupère le catalogue de l'utilisateur",
    description:
      'Retourne toutes les collections avec leurs produits et les produits non catégorisés.',
  })
  @ApiResponse({
    status: 200,
    description: 'Catalogue récupéré avec succès',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT required',
  })
  async getCatalog(@Req() req: any) {
    const userId = req.user.id;
    this.logger.debug(`Fetching catalog for user: ${userId}`);

    const result = await this.catalogService.getCatalog(userId);

    if (!result.success) {
      throw new BadRequestException(result.error || 'Failed to fetch catalog');
    }

    return result;
  }
}
