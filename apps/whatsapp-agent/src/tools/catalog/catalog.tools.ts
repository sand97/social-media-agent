import {
  CatalogSearchService,
  ProductSearchResult,
} from '@app/catalog/catalog-search.service';
import { ConnectorClientService } from '@app/connector/connector-client.service';
import { PageScriptService } from '@app/page-scripts/page-script.service';
import { tool } from '@langchain/core/tools';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { instrumentTools } from '../tool-logging.util';

/**
 * Catalog tools for the WhatsApp agent
 * Uses semantic search with embeddings in Qdrant
 */
@Injectable()
export class CatalogTools {
  private readonly logger = new Logger(CatalogTools.name);

  constructor(
    private readonly connectorClient: ConnectorClientService,
    private readonly catalogSearch: CatalogSearchService,
    private readonly scriptService: PageScriptService,
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
   * Search products with semantic vector search in Qdrant.
   */
  private createSearchProductsTool() {
    return tool(
      async ({ query, query_en, limit }, config?: any) => {
        try {
          // Semantic search in Qdrant via CatalogSearchService
          const result = await this.catalogSearch.searchProducts(
            query,
            limit,
            query_en,
          );
          const compactProducts = this.toCompactSearchProducts(result.products);
          const productsCsv = this.toProductsCsv(compactProducts);

          return JSON.stringify({
            success: result.success,
            products: compactProducts,
            products_csv: productsCsv,
            query,
            query_en,
            count: compactProducts.length,
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
          'Search products using semantic retrieval + hybrid reranking. ' +
          'Pass query as the user-language keywords (name/description intent). ' +
          'Pass query_en as the English interpretation of the same intent, used especially to match cover_image_description (which is in English). ' +
          'When possible, provide both query and query_en to improve multilingual recall. ' +
          'The tool returns a compact CSV with columns: productID, rankingScore, description, price.',
        schema: z.object({
          query: z
            .string()
            .describe(
              'User-language query from the contact message. Example: "maillot barca", "robe elegante".',
            ),
          query_en: z
            .string()
            .optional()
            .describe(
              'English interpretation of the same product intent. Example: "barcelona jersey", "elegant dress".',
            ),
          limit: z
            .number()
            .default(10)
            .describe('Maximum number of results to return'),
        }),
      },
    );
  }

  private toCompactSearchProducts(products: ProductSearchResult[]): Array<{
    productID: string;
    rankingScore: number;
    description: string;
    price: number | null;
  }> {
    return products
      .filter(
        (product) =>
          typeof product.rankingScore === 'number' &&
          Number.isFinite(product.rankingScore),
      )
      .map((product) => ({
        productID: product.id,
        rankingScore: product.rankingScore as number,
        description: product.description || '',
        price: typeof product.price === 'number' ? product.price : null,
      }));
  }

  private toProductsCsv(
    products: Array<{
      productID: string;
      rankingScore: number;
      description: string;
      price: number | null;
    }>,
  ): string {
    const header = 'productID,rankingScore,description,price';
    const rows = products.map((product) =>
      [
        this.escapeCsv(product.productID),
        this.escapeCsv(product.rankingScore.toString()),
        this.escapeCsv(product.description),
        this.escapeCsv(product.price === null ? '' : product.price.toString()),
      ].join(','),
    );

    return [header, ...rows].join('\n');
  }

  private escapeCsv(value: string): string {
    if (!/[",\n\r]/.test(value)) {
      return value;
    }
    return `"${value.replace(/"/g, '""')}"`;
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
