import { CatalogSearchService } from '@app/catalog/catalog-search.service';
import { EmbeddingsService } from '@app/catalog-shared/embeddings.service';
import { ConnectorClientService } from '@app/connector/connector-client.service';
import { QdrantService } from '@app/image-processing/qdrant.service';
import { PageScriptService } from '@app/page-scripts/page-script.service';
import { tool } from '@langchain/core/tools';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { instrumentTools } from '../tool-logging.util';

/**
 * Catalog tools for the WhatsApp agent
 * Uses semantic search with embeddings when available
 * Falls back to direct WhatsApp search when embeddings not ready
 */
@Injectable()
export class CatalogTools {
  private readonly logger = new Logger(CatalogTools.name);

  constructor(
    private readonly connectorClient: ConnectorClientService,
    private readonly catalogSearch: CatalogSearchService,
    private readonly scriptService: PageScriptService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly qdrantService: QdrantService,
  ) {}

  /**
   * Create all catalog tools
   */
  createTools() {
    const tools = [
      this.createListProductsTool(),
      this.createSearchProductsTool(),
      this.createGetProductDetailsTool(),
    ];

    return instrumentTools(this.logger, CatalogTools.name, tools);
  }

  /**
   * List products from catalog (directly from WhatsApp via connector)
   */
  private createListProductsTool() {
    return tool(
      async ({ limit }, config?: any) => {
        try {
          const script = this.scriptService.getScript(
            'catalog/getCollections',
            {
              LIMIT: String(limit || 20),
            },
          );

          const products = await this.connectorClient.executeScript(script);

          // Log tool output (truncated) for debugging
          const preview =
            products && typeof products === 'object'
              ? JSON.stringify(products).substring(0, 400)
              : String(products).substring(0, 400);
          console.debug(
            `[tool:list_products] preview: ${preview} (count=${
              products?.length ?? 'n/a'
            })`,
          );

          return JSON.stringify({
            success: true,
            products,
            count: products?.length || 0,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'list_products',
        description:
          'List products from the WhatsApp catalog directly from WhatsApp Web.',
        schema: z.object({
          limit: z
            .number()
            .default(20)
            .describe('Maximum number of products to return'),
        }),
      },
    );
  }

  /**
   * Search products with intelligent routing:
   * - Uses vector search (Qdrant) if available (best results, free)
   * - Falls back to direct WhatsApp search if Qdrant not configured
   */
  private createSearchProductsTool() {
    return tool(
      async ({ query, limit, scoreThreshold }, config?: any) => {
        try {
          // Use intelligent search service with automatic fallback
          const result = await this.catalogSearch.searchProducts(
            query,
            limit,
            scoreThreshold,
          );

          return JSON.stringify({
            success: result.success,
            products: result.products,
            query,
            count: result.products.length,
            method: result.method, // 'vector_search' or 'direct_whatsapp'
            error: result.error,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'search_products',
        description:
          'Search products intelligently using vector search (understands synonyms, context, and semantic meaning). ' +
          'Automatically falls back to direct WhatsApp search if vector search is not available. ' +
          'Use this to find products based on natural language descriptions or multiple keywords.',
        schema: z.object({
          query: z
            .string()
            .describe(
              'Natural language search query (e.g. "elegant evening dress", "smartphone with good camera", "red shoes for running")',
            ),
          limit: z
            .number()
            .default(10)
            .describe('Maximum number of results to return'),
          scoreThreshold: z
            .number()
            .default(0.7)
            .describe(
              'Minimum similarity score for vector search (0-1). Higher = more strict matching. Default: 0.7',
            ),
        }),
      },
    );
  }

  /**
   * Get detailed information about a specific product (directly from WhatsApp)
   */
  private createGetProductDetailsTool() {
    return tool(
      async ({ productId }, config?: any) => {
        try {
          const script = this.scriptService.getScript(
            'catalog/getProductDetails',
            { PRODUCT_ID: productId },
          );

          const product = await this.connectorClient.executeScript(script);

          if (!product) {
            return JSON.stringify({
              success: false,
              error: 'Produit non trouvé',
            });
          }

          return JSON.stringify({
            success: true,
            product,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'get_product_details',
        description:
          'Get full details for a specific product directly from WhatsApp (price, description, images, availability, etc.).',
        schema: z.object({
          productId: z.string().describe('WhatsApp product ID'),
        }),
      },
    );
  }
}
