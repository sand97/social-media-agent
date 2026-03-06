import { BackendClientModule } from '@app/backend-client/backend-client.module';
import { CatalogSharedModule } from '@app/catalog-shared/catalog-shared.module';
import { Module } from '@nestjs/common';

import { GeminiVisionService } from './gemini-vision.service';
import { ImageEmbeddingsService } from './image-embeddings.service';
import { ImageProductMatchingService } from './image-product-matching.service';
import { ImageProcessingController } from './image-processing.controller';
import { OcrService } from './ocr.service';
import { QdrantService } from './qdrant.service';
import { SmartCropService } from './smart-crop.service';

@Module({
  imports: [BackendClientModule, CatalogSharedModule],
  controllers: [ImageProcessingController],
  providers: [
    OcrService,
    QdrantService,
    ImageEmbeddingsService,
    ImageProductMatchingService,
    SmartCropService,
    GeminiVisionService,
  ],
  exports: [
    OcrService,
    QdrantService,
    ImageEmbeddingsService,
    ImageProductMatchingService,
    SmartCropService,
    GeminiVisionService,
  ],
})
export class ImageProcessingModule {}
