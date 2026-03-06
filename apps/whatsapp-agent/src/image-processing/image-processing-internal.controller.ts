import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

import { InternalJwtGuard } from '../security/internal-jwt.guard';

import { ImageIndexingQueueService } from './image-indexing-queue.service';
import { ProductImageIndexingService } from './product-image-indexing.service';
import { QdrantService } from './qdrant.service';

class IndexProductImageDto {
  @IsString()
  productId!: string;

  @IsString()
  productName!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  retailerId?: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsString()
  imageBuffer!: string;
}

@ApiTags('image-processing')
@Controller('image-processing')
// @UseGuards(InternalJwtGuard)
export class ImageProcessingInternalController {
  constructor(
    private readonly productImageIndexingService: ProductImageIndexingService,
    private readonly imageIndexingQueueService: ImageIndexingQueueService,
    private readonly qdrantService: QdrantService,
  ) {}

  @Post('index-product-image')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Index product cover image into Qdrant image/text collections',
    description:
      "Endpoint interne de production, appelé par le whatsapp-agent lui-même pendant l'indexation en arrière-plan. Il ne doit pas être appelé par le frontend ni par des clients externes.",
  })
  @ApiResponse({
    status: 200,
    description: 'Product image indexed successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'JWT interne backend->agent invalide ou absent',
  })
  async indexProductImage(@Body() dto: IndexProductImageDto) {
    return this.productImageIndexingService.indexProductFromBase64(dto);
  }

  @Post('sync-catalog-images')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Queue full catalog image indexing on whatsapp-agent',
    description:
      "Endpoint interne de maintenance pour lancer explicitement un job d'indexation catalogue côté agent (Qdrant + Gemini). En production, le flux standard passe par /catalog/sync qui orchestre déjà cette étape.",
  })
  @ApiResponse({
    status: 200,
    description: 'Catalog image indexing job queued',
  })
  async queueCatalogImageSync() {
    const queueResult =
      await this.imageIndexingQueueService.enqueueCatalogImageSync();

    return {
      success: true,
      queued: queueResult.queued,
      message: queueResult.message,
    };
  }

  @Post('reset-qdrant')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset Qdrant collections for image/text search',
    description:
      'Endpoint interne protégé pour purger et recréer les collections Qdrant product-images et product-text.',
  })
  @ApiResponse({
    status: 200,
    description: 'Qdrant collections reset successfully',
  })
  async resetQdrant() {
    const collections = await this.qdrantService.resetCollections();
    return {
      success: true,
      collections,
    };
  }
}
