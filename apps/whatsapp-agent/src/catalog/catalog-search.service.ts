import { ConnectorClientService } from '@app/connector/connector-client.service';
import { Prisma } from '@app/generated/client';
import { PrismaService } from '@app/prisma/prisma.service';
import { Injectable, Logger } from '@nestjs/common';

import { EmbeddingsService } from './embeddings.service';

export interface ProductSearchResult {
  id: string;
  name: string;
  description?: string;
  price?: number;
  currency?: string;
  availability?: string;
  collectionName?: string;
  similarity?: number; // Only present for semantic search
}

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
 * Service for searching products with intelligent fallback
 * - Primary: Semantic search using local embeddings (fast, intelligent)
 * - Fallback: Direct WhatsApp search (slower, exact match)
 */
@Injectable()
export class CatalogSearchService {
  private readonly logger = new Logger(CatalogSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
    private readonly connectorClient: ConnectorClientService,
  ) {}

  /**
   * Search products with intelligent routing
   * Uses semantic search if available, otherwise falls back to WhatsApp direct search
   */
  async searchProducts(
    query: string,
    limit: number = 10,
  ): Promise<{
    success: boolean;
    products: ProductSearchResult[];
    method: 'semantic' | 'direct_whatsapp';
    error?: string;
  }> {
    try {
      // Try semantic search first if embeddings are available
      if (await this.hasEmbeddingsInDB()) {
        return await this.searchSemantic(query, limit);
      }

      // Fallback to direct WhatsApp search
      this.logger.debug(
        'Embeddings not available, falling back to direct WhatsApp search',
      );
      return await this.searchDirectWhatsApp(query, limit);
    } catch (error) {
      this.logger.error(`Search failed: ${error.message}`);
      return {
        success: false,
        products: [],
        method: 'semantic',
        error: error.message,
      };
    }
  }

  /**
   * Semantic search using local embeddings
   */
  private async searchSemantic(
    query: string,
    limit: number,
  ): Promise<{
    success: boolean;
    products: ProductSearchResult[];
    method: 'semantic';
  }> {
    this.logger.debug(`🧠 Semantic search for: "${query}"`);

    // Generate embedding for the query
    const queryEmbedding = await this.embeddings.embedText(query);

    // Fetch all products with embeddings from DB
    const productsInDB = await this.prisma.catalogProduct.findMany({
      where: {
        embedding: {
          not: Prisma.JsonNull,
        },
      },
    });

    // Calculate similarities and rank
    const items = productsInDB.map((product) => ({
      embedding: product.embedding as number[],
      data: product,
    }));

    const results = this.embeddings.findTopK(queryEmbedding, items, limit);

    // Map to ProductSearchResult
    const products: ProductSearchResult[] = results.map((result) => ({
      id: result.data.id,
      name: result.data.name,
      description: result.data.description || undefined,
      price: result.data.price || undefined,
      currency: result.data.currency || undefined,
      availability: result.data.availability || undefined,
      collectionName: result.data.collectionName || undefined,
      similarity: result.similarity,
    }));

    this.logger.debug(
      `✅ Found ${products.length} results via semantic search`,
    );

    return {
      success: true,
      products,
      method: 'semantic',
    };
  }

  /**
   * Direct WhatsApp search (fallback when embeddings not available)
   */
  private async searchDirectWhatsApp(
    query: string,
    limit: number,
  ): Promise<{
    success: boolean;
    products: ProductSearchResult[];
    method: 'direct_whatsapp';
  }> {
    this.logger.debug(`📱 Direct WhatsApp search for: "${query}"`);

    const script = `
      (async () => {
        const collections = await WPP.catalog.getCollections();
        let allProducts = [];
        const searchQuery = "${query}".toLowerCase();

        for (const collection of collections) {
          const products = await WPP.catalog.getProductsFromCollection(collection.id, 100);

          const filtered = products.filter(p =>
            p.name?.toLowerCase().includes(searchQuery) ||
            p.description?.toLowerCase().includes(searchQuery) ||
            collection.name?.toLowerCase().includes(searchQuery)
          );

          allProducts = allProducts.concat(filtered.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
            price: p.price,
            currency: p.currency,
            availability: p.availability,
            collectionName: collection.name
          })));
        }

        return allProducts.slice(0, ${limit});
      })()
    `;

    const products = await this.connectorClient.executeScript(script);

    this.logger.debug(
      `✅ Found ${products?.length || 0} results via direct WhatsApp search`,
    );

    return {
      success: true,
      products: products || [],
      method: 'direct_whatsapp',
    };
  }

  /**
   * Check if we have embeddings in the database
   */
  private async hasEmbeddingsInDB(): Promise<boolean> {
    const count = await this.prisma.catalogProduct.count({
      where: {
        embedding: {
          not: Prisma.JsonNull,
        },
      },
    });

    return count > 0;
  }
}
