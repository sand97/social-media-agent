import * as crypto from 'crypto';

import { EmbeddingsService } from '@app/catalog-shared/embeddings.service';
import { ConnectorClientService } from '@app/connector/connector-client.service';
import { Prisma } from '@app/generated/client';
import { ImageIndexingQueueService } from '@app/image-processing/image-indexing-queue.service';
import { PageScriptService } from '@app/page-scripts/page-script.service';
import { PrismaService } from '@app/prisma/prisma.service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

interface WhatsAppProduct {
  id: string;
  name: string;
  description?: string;
  price?: number | null;
  currency?: string;
  availability?: string;
  retailerId?: string;
  maxAvailable?: number;
  imageHashesForWhatsapp?: string[];
  collectionId?: string;
  collectionName?: string;
}

interface CatalogSignature {
  quickHash: string; // Hash des IDs seulement
  fullHash: string; // Hash complet avec metadata
  productsCount: number;
  lastSyncedAt: Date;
}

/**
 * Service for syncing WhatsApp catalog to local DB with embeddings
 * Runs in background after connector is ready
 */
@Injectable()
export class CatalogSyncService {
  private readonly logger = new Logger(CatalogSyncService.name);
  private isSyncing = false;
  private lastSyncTime: Date | null = null;
  private readonly syncOptimizationEnabled: boolean;

  constructor(
    private readonly connectorClient: ConnectorClientService,
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
    private readonly scriptService: PageScriptService,
    private readonly imageIndexingQueueService: ImageIndexingQueueService,
    private readonly configService: ConfigService,
  ) {
    // Par défaut, l'optimisation est DÉSACTIVÉE (toujours synchroniser)
    // Mettre ENABLE_CATALOG_SYNC_OPTIMIZATION=true pour activer l'optimisation (skip si unchanged)
    this.syncOptimizationEnabled =
      this.configService.get<string>('ENABLE_CATALOG_SYNC_OPTIMIZATION') ===
      'true';

    if (this.syncOptimizationEnabled) {
      this.logger.log(
        '⚡ Catalog sync optimization enabled (will skip unchanged catalogs)',
      );
    } else {
      this.logger.log(
        '🔄 Catalog sync optimization disabled (will always sync)',
      );
    }
  }

  /**
   * @deprecated This method is no longer used. The agent no longer interacts with
   * the connector for catalog syncing. Authentication is handled by the backend.
   *
   * Check if connector is authenticated
   */
  private async checkAuthentication(): Promise<boolean> {
    try {
      const script = this.scriptService.getScript('isAuthenticated', {});
      const { result } = await this.connectorClient.executeScript(script);
      console.log('result', result);

      if (result.success && result.isAuthenticated) {
        return true;
      }

      this.logger.warn('Connector is not authenticated');
      return false;
    } catch (error) {
      this.logger.error(
        `Failed to check authentication: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  /**
   * @deprecated This method is no longer used. Signature-based optimization is deprecated
   * as the agent no longer fetches products from WhatsApp. Products are managed by the backend.
   *
   * Generate catalog signature (two-level hash for optimization)
   * - quickHash: Hash of product IDs only (fast, detects add/remove)
   * - fullHash: Hash of full metadata (detects price/description changes)
   */
  private generateCatalogSignature(
    products: WhatsAppProduct[],
  ): CatalogSignature {
    // Sort products by ID for deterministic hashing
    const sortedProducts = [...products].sort((a, b) =>
      a.id.localeCompare(b.id),
    );

    // Quick hash: IDs only (ultra fast)
    const sortedIds = sortedProducts.map((p) => p.id).join(',');
    const quickHash = crypto
      .createHash('sha256')
      .update(sortedIds)
      .digest('hex');

    // Full hash: Complete metadata (detects all changes)
    const catalogData = sortedProducts
      .map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        availability: p.availability,
        imageHashes: p.imageHashesForWhatsapp?.join(',') || '',
        collectionId: p.collectionId,
      }))
      .map((p) => JSON.stringify(p))
      .join('|');

    const fullHash = crypto
      .createHash('sha256')
      .update(catalogData)
      .digest('hex');

    return {
      quickHash,
      fullHash,
      productsCount: products.length,
      lastSyncedAt: new Date(),
    };
  }

  /**
   * Scheduled catalog sync every 4 hours using cron
   * Runs at minute 0 of every 4th hour (00:00, 04:00, 08:00, etc.)
   */
  @Cron(CronExpression.EVERY_4_HOURS)
  async handleScheduledSync() {
    try {
      await this.syncCatalog();
    } catch (error) {
      this.logger.error(`Scheduled sync failed: ${error.message}`);
    }
  }

  /**
   * Manually trigger catalog sync (e.g., from dashboard or webhook)
   */
  async triggerManualSync(): Promise<{ success: boolean; message: string }> {
    if (this.isSyncing) {
      return {
        success: false,
        message: 'Sync already in progress',
      };
    }

    try {
      await this.syncCatalog();
      return {
        success: true,
        message: `Synced at ${this.lastSyncTime?.toISOString()}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Trigger catalog sync in background and return immediately.
   * Used by backend internal orchestration endpoints.
   */
  triggerManualSyncInBackground(): {
    success: boolean;
    message: string;
    imageSyncQueued: boolean;
  } {
    if (this.isSyncing) {
      return {
        success: false,
        message: 'Sync already in progress',
        imageSyncQueued: false,
      };
    }

    void this.syncCatalogAndQueueImages().catch(async (error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Background catalog+image sync failed: ${errorMessage}`,
      );

      await this.imageIndexingQueueService
        .markCatalogImageSyncFailed(errorMessage)
        .catch(() => undefined);
    });

    return {
      success: true,
      message: 'Catalog and image indexing pipeline started in background',
      imageSyncQueued: true,
    };
  }

  private async syncCatalogAndQueueImages(): Promise<void> {
    await this.syncCatalog();
    const queueResult =
      await this.imageIndexingQueueService.enqueueCatalogImageSync();

    if (!queueResult.queued) {
      this.logger.warn(`Image indexing queue skipped: ${queueResult.message}`);
    }
  }

  /**
   * Get sync status
   */
  getSyncStatus() {
    return {
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      embeddingsAvailable: this.embeddings.isAvailable(),
    };
  }

  /**
   * Main sync function - runs in background
   *
   * IMPORTANT: This service NO LONGER fetches products from WhatsApp connector.
   * The backend already syncs products from connector and stores them in the database.
   * This service only triggers Qdrant indexing of products already in the backend.
   */
  private async syncCatalog(): Promise<void> {
    if (this.isSyncing) {
      this.logger.debug('Sync already in progress, skipping');
      return;
    }

    this.isSyncing = true;
    const startTime = Date.now();

    try {
      this.logger.log('🔄 Starting catalog indexing to Qdrant...');

      // Step 1: Queue Qdrant indexing (text + images)
      // The backend has already synced products from WhatsApp connector
      // We just need to index them in Qdrant for vector search
      this.logger.log('🚀 Queueing text/image indexing to Qdrant...');

      const queueResult =
        await this.imageIndexingQueueService.enqueueCatalogImageSync();

      if (queueResult.queued) {
        this.logger.log('✅ Qdrant indexing job queued successfully');
      } else {
        this.logger.warn(
          `⚠️ Qdrant indexing not queued: ${queueResult.message}`,
        );
      }

      this.lastSyncTime = new Date();
      const duration = Date.now() - startTime;

      this.logger.log(
        `✅ Catalog indexing queued in ${(duration / 1000).toFixed(1)}s`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Catalog indexing failed: ${error.message}`,
        error.stack,
      );
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * @deprecated This function is deprecated. Embeddings are now stored ONLY in Qdrant.
   * Text/image indexing is handled by the image-indexing queue service.
   * Database storage of embeddings is no longer used.
   *
   * Generate embeddings and store products in DB
   */
  private async generateAndStoreEmbeddings(
    products: WhatsAppProduct[],
  ): Promise<void> {
    this.logger.log('🧠 Generating embeddings...');

    // Create text representations for embedding
    const texts = products.map((product) => {
      // Combine name, description, and collection for better semantic search
      const parts = [
        product.name,
        product.description || '',
        product.collectionName || '',
      ].filter(Boolean);

      return parts.join(' | ');
    });

    // Generate embeddings in batch (more efficient)
    const embeddings = await this.embeddings.embedBatch(texts);

    this.logger.log(`📊 Generated ${embeddings.length} embeddings`);

    // Store in database with embeddings
    await this.prisma.$transaction(async (tx) => {
      // Delete old products first
      await tx.catalogProduct.deleteMany({});

      // Insert new products with embeddings
      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        const embedding = embeddings[i];

        await tx.catalogProduct.create({
          data: {
            id: product.id,
            name: product.name,
            description: product.description,
            price: product.price,
            currency: product.currency,
            availability: product.availability,
            collectionId: product.collectionId,
            collectionName: product.collectionName,
            retailerId: product.retailerId,
            maxAvailable: product.maxAvailable,
            imageHashes: product.imageHashesForWhatsapp || [],
            embedding: embedding, // Store as JSON array
            lastSyncedAt: new Date(),
          },
        });
      }
    });

    this.logger.log('💾 Stored products with embeddings in database');
  }

  /**
   * @deprecated This function is deprecated. Products are now indexed ONLY in Qdrant.
   * Text/image indexing is handled by the image-indexing queue service.
   * Database storage of products without embeddings is no longer used.
   *
   * Store products without embeddings (fallback)
   */
  private async storeProductsWithoutEmbeddings(
    products: WhatsAppProduct[],
  ): Promise<void> {
    this.logger.log(
      '💾 Storing products without embeddings (GEMINI_API_KEY not configured)',
    );

    await this.prisma.$transaction(async (tx) => {
      // Delete old products first
      await tx.catalogProduct.deleteMany({});

      // Insert new products without embeddings
      for (const product of products) {
        await tx.catalogProduct.create({
          data: {
            id: product.id,
            name: product.name,
            description: product.description,
            price: product.price,
            currency: product.currency,
            availability: product.availability,
            collectionId: product.collectionId,
            collectionName: product.collectionName,
            retailerId: product.retailerId,
            maxAvailable: product.maxAvailable,
            imageHashes: product.imageHashesForWhatsapp || [],
            embedding: Prisma.JsonNull,
            lastSyncedAt: new Date(),
          },
        });
      }
    });

    this.logger.log('💾 Stored products in database (text search only)');
  }
}
