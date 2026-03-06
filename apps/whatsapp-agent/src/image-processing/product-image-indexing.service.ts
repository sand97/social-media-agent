import {
  InternalProductForImageIndexing,
  InternalProductImageIndexingUpdate,
} from '@app/backend-client/backend-api.types';
import { BackendClientService } from '@app/backend-client/backend-client.service';
import { EmbeddingsService } from '@app/catalog-shared/embeddings.service';
import { PromptGeneratorService } from '@app/catalog-shared/prompt-generator.service';
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import type { Job } from 'bull';

import { GeminiVisionService } from './gemini-vision.service';
import { ImageEmbeddingsService } from './image-embeddings.service';
import { QdrantService } from './qdrant.service';

interface IndexProductPayload {
  productId: string;
  productName: string;
  description?: string | null;
  retailerId?: string | null;
  price?: number | null;
  category?: string | null;
  imageBuffer: Buffer;
}

interface ProductIndexingPlan {
  imageIdsToIndex: string[];
  shouldIndexImage: boolean;
  shouldIndexText: boolean;
  shouldGenerateCoverDescription: boolean;
}

interface SyncReindexContext {
  forceImageReindex: boolean;
  forceTextReindex: boolean;
}

interface ProductIndexingResult {
  indexedImageIds: string[];
  indexedText: boolean;
  coverDescriptionToPersist?: string;
}

@Injectable()
export class ProductImageIndexingService {
  private readonly logger = new Logger(ProductImageIndexingService.name);
  private static readonly IMAGE_DOWNLOAD_TIMEOUT_MS = 30000;

  constructor(
    private readonly geminiVisionService: GeminiVisionService,
    private readonly imageEmbeddingsService: ImageEmbeddingsService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly qdrantService: QdrantService,
    private readonly backendClient: BackendClientService,
    private readonly promptGeneratorService: PromptGeneratorService,
  ) {}

  async indexProductFromBase64(payload: {
    productId: string;
    productName: string;
    description?: string;
    retailerId?: string;
    price?: number;
    category?: string;
    imageBuffer: string;
  }) {
    const imageBuffer = Buffer.from(payload.imageBuffer, 'base64');

    const indexed = await this.indexProductFromBuffer({
      productId: payload.productId,
      productName: payload.productName,
      description: payload.description,
      retailerId: payload.retailerId,
      price: payload.price,
      category: payload.category,
      imageBuffer,
    });

    await this.backendClient.batchUpdateProductImageIndexing([
      {
        productId: payload.productId,
        coverImageDescription: indexed.coverDescription,
        textIndexed: true,
      },
    ]);

    return {
      success: true,
      coverDescription: indexed.coverDescription,
    };
  }

  async syncCatalogProducts(job?: Job): Promise<{
    success: boolean;
    total: number;
    processed: number;
    failed: number;
    message: string;
  }> {
    this.logger.log('📋 Fetching agent snapshot...');
    // Refresh agent snapshot once at sync start, then reuse cached values.
    await this.backendClient.getAgentSnapshot(true);

    this.logger.log(
      '✅ Using local CLIP image embeddings + Gemini text embeddings',
    );

    this.logger.log('📡 Updating sync status to SYNCING...');
    await this.backendClient.updateAgentImageSyncStatus({ status: 'SYNCING' });

    this.logger.log('📦 Fetching products from backend...');
    const products = await this.backendClient.getProductsForImageIndexing();
    this.logger.log(`✅ Retrieved ${products.length} products from backend`);

    const staleCleanup = await this.qdrantService.deleteStaleProducts(
      products.map((product) => product.id),
    );
    if (staleCleanup.deleted > 0) {
      this.logger.log(
        `🧹 Removed ${staleCleanup.deleted} stale products from Qdrant (${staleCleanup.stale}/${staleCleanup.indexed} indexed)`,
      );
    } else {
      this.logger.debug(
        `🧹 No stale products to remove from Qdrant (${staleCleanup.indexed} indexed)`,
      );
    }

    if (products.length === 0) {
      this.logger.warn('⚠️ No products to index');
      await this.backendClient.updateAgentImageSyncStatus({ status: 'DONE' });
      return {
        success: true,
        total: 0,
        processed: 0,
        failed: 0,
        message: 'No products to index',
      };
    }

    const [imagePoints, textPoints] = await Promise.all([
      this.qdrantService.getCollectionPointsCount('image'),
      this.qdrantService.getCollectionPointsCount('text'),
    ]);
    const reindexContext: SyncReindexContext = {
      forceImageReindex: imagePoints === 0,
      forceTextReindex: textPoints === 0,
    };

    if (reindexContext.forceImageReindex || reindexContext.forceTextReindex) {
      this.logger.warn(
        `Qdrant collection(s) empty detected (image_points=${imagePoints}, text_points=${textPoints}). Forcing full reindex where needed.`,
      );
    }

    const plannedProducts = products.map((product) => ({
      product,
      plan: this.buildIndexingPlan(product, reindexContext),
    }));

    const skippedProducts = plannedProducts
      .filter(({ plan }) => !plan.shouldIndexImage && !plan.shouldIndexText)
      .map(({ product }) => ({
        id: product.id,
        name: product.name,
        needsTextIndexing: product.needsTextIndexing,
        pendingImages: product.images.filter(
          (image) => image.needsImageIndexing,
        ).length,
      }));

    if (skippedProducts.length > 0) {
      this.logger.log(
        `⏭️ Skipped products (up-to-date): ${JSON.stringify(skippedProducts)}`,
      );
    }

    const shouldGeneratePrompt = plannedProducts.some(
      ({ plan }) => plan.shouldGenerateCoverDescription,
    );

    if (shouldGeneratePrompt) {
      await this.promptGeneratorService.ensureCustomPrompt();
    }

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    for (let index = 0; index < plannedProducts.length; index++) {
      const { product, plan } = plannedProducts[index];

      if (!plan.shouldIndexImage && !plan.shouldIndexText) {
        skipped += 1;
        if (job) {
          job.progress(
            Math.round(((index + 1) / plannedProducts.length) * 100),
          );
        }
        continue;
      }

      try {
        const result = await this.indexCatalogProduct(product, plan);

        const update = this.buildBackendUpdate(product.id, result);
        if (update) {
          await this.backendClient.batchUpdateProductImageIndexing([update]);
        }

        processed += 1;
      } catch (error: any) {
        failed += 1;
        this.logger.warn(
          `Failed to index product ${product.id}: ${error?.message || error}`,
        );
      }

      if (job) {
        job.progress(Math.round(((index + 1) / plannedProducts.length) * 100));
      }
    }

    if (failed > 0) {
      const message = `${failed} products failed during image indexing`;
      await this.backendClient.updateAgentImageSyncStatus({
        status: 'FAILED',
        error: message,
      });

      return {
        success: false,
        total: products.length,
        processed,
        failed,
        message,
      };
    }

    await this.backendClient.updateAgentImageSyncStatus({ status: 'DONE' });

    this.logger.log(
      `✅ Indexing summary: ${processed} products indexed (${skipped} skipped, ${failed} failed)`,
    );

    return {
      success: true,
      total: products.length,
      processed,
      failed,
      message: `Catalog indexing completed: ${processed} products indexed (images + text), ${skipped} skipped (up-to-date), ${failed} failed`,
    };
  }

  private buildIndexingPlan(
    product: InternalProductForImageIndexing,
    reindexContext: SyncReindexContext,
  ): ProductIndexingPlan {
    const imageIdsToIndex = reindexContext.forceImageReindex
      ? product.images.map((image) => image.id)
      : product.images
          .filter((image) => image.needsImageIndexing)
          .map((image) => image.id);
    const shouldIndexImage = imageIdsToIndex.length > 0;
    const shouldIndexText =
      reindexContext.forceTextReindex || product.needsTextIndexing;

    const hasCoverDescription = !!product.coverImageDescription?.trim();
    const hasCoverImage = !!this.getCoverImage(product)?.url;

    return {
      imageIdsToIndex,
      shouldIndexImage,
      shouldIndexText,
      shouldGenerateCoverDescription:
        shouldIndexText && !hasCoverDescription && hasCoverImage,
    };
  }

  private async indexCatalogProduct(
    product: InternalProductForImageIndexing,
    plan: ProductIndexingPlan,
  ): Promise<ProductIndexingResult> {
    const coverImage = this.getCoverImage(product);
    const imageIdsToIndex = new Set(plan.imageIdsToIndex);
    const indexedImageIds: string[] = [];

    if (plan.shouldIndexImage) {
      if (product.images.length === 0) {
        this.logger.warn(
          `Image indexing skipped for product ${product.id}: no product images`,
        );
      } else {
        for (const image of product.images) {
          if (!imageIdsToIndex.has(image.id)) {
            continue;
          }

          if (!image.url) {
            continue;
          }

          try {
            const imageBuffer = await this.downloadImage(image.url);
            const imageEmbedding =
              await this.imageEmbeddingsService.generateEmbedding(imageBuffer);

            await this.qdrantService.indexProductImageVariant(
              product.id,
              image.id,
              imageEmbedding,
              {
                product_id: product.id,
                product_name: product.name,
                description: product.description || null,
                retailer_id: product.retailer_id || null,
                category: product.category || null,
                price: product.price || null,
                image_id: image.id,
                image_index: image.imageIndex,
                image_url: image.url,
                image_description: null,
              },
            );

            indexedImageIds.push(image.id);
          } catch (error: any) {
            this.logger.warn(
              `Failed to index image ${image.id} for product ${product.id}: ${error?.message || error}`,
            );
          }
        }

        if (indexedImageIds.length > 0) {
          this.logger.log(`✅ Images indexed for product ${product.id}`);
        } else {
          this.logger.warn(
            `Image indexing failed for all images of product ${product.id}`,
          );
        }
      }
    }

    let coverDescription = product.coverImageDescription?.trim() || '';
    let generatedCoverDescription: string | undefined;

    if (plan.shouldGenerateCoverDescription && coverImage?.url) {
      const coverImageBuffer = await this.downloadImage(coverImage.url);
      coverDescription =
        await this.geminiVisionService.describeProductImage(coverImageBuffer);
      generatedCoverDescription = coverDescription;
    } else if (plan.shouldGenerateCoverDescription) {
      this.logger.warn(
        `Cover description generation skipped for product ${product.id}: missing cover image`,
      );
    }

    let indexedText = false;

    if (plan.shouldIndexText) {
      const textToEmbed = [
        product.name,
        product.description || '',
        coverDescription,
      ]
        .filter(Boolean)
        .join(' | ');

      this.logger.debug(
        `📝 Generating Gemini text embedding for product ${product.id}`,
      );
      const textEmbedding = await this.embeddingsService.embedText(textToEmbed);

      this.logger.debug(`💾 Indexing text in Qdrant collection "product-text"`);
      await this.qdrantService.indexProductText(product.id, textEmbedding, {
        product_id: product.id,
        product_name: product.name,
        description: product.description || null,
        cover_image_description: coverDescription || null,
        retailer_id: product.retailer_id || null,
        category: product.category || null,
        price: product.price || null,
      });

      indexedText = true;
      this.logger.log(`✅ Text indexed for product ${product.id}`);
    }

    return {
      indexedImageIds,
      indexedText,
      coverDescriptionToPersist: generatedCoverDescription,
    };
  }

  private buildBackendUpdate(
    productId: string,
    result: ProductIndexingResult,
  ): InternalProductImageIndexingUpdate | null {
    const update: InternalProductImageIndexingUpdate = { productId };

    if (result.coverDescriptionToPersist !== undefined) {
      update.coverImageDescription = result.coverDescriptionToPersist;
    }

    if (result.indexedText) {
      update.textIndexed = true;
    }

    if (result.indexedImageIds.length > 0) {
      update.indexedImageIds = result.indexedImageIds;
    }

    if (Object.keys(update).length === 1) {
      return null;
    }

    return update;
  }

  private async indexProductFromBuffer(payload: IndexProductPayload): Promise<{
    coverDescription: string;
  }> {
    const coverDescription =
      await this.geminiVisionService.describeProductImage(payload.imageBuffer);
    const imageEmbedding =
      await this.imageEmbeddingsService.generateEmbedding(payload.imageBuffer);

    const textToEmbed = [
      payload.productName,
      payload.description || '',
      coverDescription,
    ]
      .filter(Boolean)
      .join(' | ');

    const textEmbedding = await this.embeddingsService.embedText(textToEmbed);

    await this.qdrantService.indexProductImageVariant(
      payload.productId,
      'manual',
      imageEmbedding,
      {
        product_id: payload.productId,
        product_name: payload.productName,
        description: payload.description || null,
        retailer_id: payload.retailerId || null,
        category: payload.category || null,
        price: payload.price || null,
        image_id: 'manual',
        image_index: 0,
        image_url: null,
        image_description: null,
      },
    );

    await this.qdrantService.indexProductText(
      payload.productId,
      textEmbedding,
      {
        product_id: payload.productId,
        product_name: payload.productName,
        description: payload.description || null,
        cover_image_description: coverDescription,
        retailer_id: payload.retailerId || null,
        category: payload.category || null,
        price: payload.price || null,
      },
    );

    return { coverDescription };
  }

  private async downloadImage(url: string): Promise<Buffer> {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: ProductImageIndexingService.IMAGE_DOWNLOAD_TIMEOUT_MS,
    });

    return Buffer.from(response.data);
  }

  private getCoverImage(
    product: InternalProductForImageIndexing,
  ): InternalProductForImageIndexing['images'][number] | null {
    if (product.images.length === 0) {
      return null;
    }

    const byIndex = product.images.find((image) => image.imageIndex === 0);
    return byIndex || product.images[0];
  }
}
