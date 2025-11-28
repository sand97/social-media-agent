import { ConnectorClientService } from '@app/connector/connector-client.service';
import { Prisma } from '@app/generated/client';
import { PageScriptService } from '@app/page-scripts/page-script.service';
import { PrismaService } from '@app/prisma/prisma.service';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';

import { EmbeddingsService } from './embeddings.service';

interface WhatsAppProduct {
  id: string;
  name: string;
  description?: string;
  price?: number;
  currency?: string;
  availability?: string;
  retailerId?: string;
  maxAvailable?: number;
  imageHashesForWhatsapp?: string[];
  collectionId?: string;
  collectionName?: string;
}

/**
 * Service for syncing WhatsApp catalog to local DB with embeddings
 * Runs in background after connector is ready
 */
@Injectable()
export class CatalogSyncService implements OnModuleInit {
  private readonly logger = new Logger(CatalogSyncService.name);
  private isSyncing = false;
  private lastSyncTime: Date | null = null;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly connectorClient: ConnectorClientService,
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly scriptService: PageScriptService,
  ) {}

  onModuleInit() {
    // Schedule hourly sync
    this.syncInterval = setInterval(
      () => {
        this.syncCatalog().catch((error) => {
          this.logger.error(`Scheduled sync failed: ${error.message}`);
        });
      },
      60 * 60 * 1000,
    ); // 1 hour
  }

  /**
   * Listen to connector ready event and trigger background sync
   */
  @OnEvent('connector.ready')
  async handleConnectorReady() {
    this.logger.log(
      'Connector is ready - starting background catalog sync with embeddings',
    );

    // Don't block - run in background
    this.syncCatalog().catch((error) => {
      this.logger.error(`Background sync failed: ${error.message}`);
    });
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
   */
  private async syncCatalog(): Promise<void> {
    if (this.isSyncing) {
      this.logger.debug('Sync already in progress, skipping');
      return;
    }

    this.isSyncing = true;
    const startTime = Date.now();

    try {
      this.logger.log('🔄 Starting catalog sync...');

      // Step 1: Fetch all products from WhatsApp via connector
      const products = await this.fetchProductsFromWhatsApp();
      this.logger.log(`📦 Fetched ${products.length} products from WhatsApp`);

      if (products.length === 0) {
        this.logger.warn('No products found in WhatsApp catalog');
        return;
      }

      // Step 2: Generate embeddings (only if API key is configured)
      if (this.embeddings.isAvailable()) {
        await this.generateAndStoreEmbeddings(products);
      } else {
        // Store without embeddings (fallback to text search)
        await this.storeProductsWithoutEmbeddings(products);
      }

      this.lastSyncTime = new Date();
      const duration = Date.now() - startTime;

      this.logger.log(
        `✅ Catalog sync completed in ${(duration / 1000).toFixed(1)}s`,
      );

      // Emit event for monitoring/dashboard
      this.eventEmitter.emit('catalog.synced', {
        productsCount: products.length,
        duration,
        hasEmbeddings: this.embeddings.isAvailable(),
      });
    } catch (error) {
      this.logger.error(
        `❌ Catalog sync failed: ${error.message}`,
        error.stack,
      );
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Fetch all products from WhatsApp via connector
   */
  private async fetchProductsFromWhatsApp(): Promise<WhatsAppProduct[]> {
    const script = this.scriptService.getScript(
      'catalog/getAllProductsForSync',
      {},
    );

    const products = await this.connectorClient.executeScript(script);
    return products || [];
  }

  /**
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
