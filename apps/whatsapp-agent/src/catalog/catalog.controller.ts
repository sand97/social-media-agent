import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { EmbeddingsService } from '../catalog-shared/embeddings.service';
import { QdrantService } from '../image-processing/qdrant.service';
import { InternalJwtGuard } from '../security/internal-jwt.guard';

import { CatalogSearchService } from './catalog-search.service';
import { CatalogSyncService } from './catalog-sync.service';

const DEBUG_TEXT_SEARCH_THRESHOLD = 0.2;
const DEBUG_TEXT_SEARCH_RELAXED_THRESHOLD = 0.12;
const DEBUG_FILTER_OUT_UNRANKED_RESULTS = true;

@ApiTags('Catalog')
@Controller('catalog')
export class CatalogController {
  private readonly logger = new Logger(CatalogController.name);

  constructor(
    private readonly catalogSyncService: CatalogSyncService,
    private readonly catalogSearchService: CatalogSearchService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly qdrantService: QdrantService,
  ) {}

  @Post('sync')
  @UseGuards(InternalJwtGuard)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Trigger manual catalog synchronization',
    description:
      'Endpoint interne de production, appelé par le backend lors du /catalog/force-sync. Lance la synchronisation locale agent (catalogue + embeddings). Non destiné au frontend.',
  })
  @ApiResponse({
    status: 200,
    description: 'Sync triggered successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        imageSyncQueued: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'JWT interne backend->agent invalide ou absent',
  })
  async triggerSync() {
    this.logger.log('🔄 Manual catalog sync triggered via API');
    return this.catalogSyncService.triggerManualSyncInBackground();
  }

  @Get('status')
  @ApiOperation({ summary: 'Get catalog sync status' })
  @ApiResponse({
    status: 200,
    description: 'Sync status retrieved',
    schema: {
      type: 'object',
      properties: {
        isSyncing: { type: 'boolean' },
        lastSyncTime: { type: 'string', nullable: true },
        embeddingsAvailable: { type: 'boolean' },
      },
    },
  })
  getSyncStatus() {
    return this.catalogSyncService.getSyncStatus();
  }

  @Post('search/test')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Debug semantic product search against Qdrant',
    description:
      'Test endpoint to validate text embedding + Qdrant retrieval for catalog products.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', example: 'maillot barcelone' },
        queryEn: { type: 'string', example: 'barcelona jersey' },
        limit: { type: 'number', example: 10, default: 10 },
      },
      required: ['query'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Search executed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        query: { type: 'string' },
        embeddingDimensions: { type: 'number' },
        limit: { type: 'number' },
        internalThreshold: { type: 'number' },
        internalRelaxedThreshold: { type: 'number' },
        count: { type: 'number' },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'string' },
              score: { type: 'number' },
              productName: { type: 'string', nullable: true },
              retailerId: { type: 'string', nullable: true },
              price: { type: 'number', nullable: true },
              similarity: { type: 'number', nullable: true },
              rankingScore: { type: 'number', nullable: true },
              payload: { type: 'object' },
            },
          },
        },
        mapped: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string', nullable: true },
              price: { type: 'number', nullable: true },
              similarity: { type: 'number', nullable: true },
              rankingScore: { type: 'number', nullable: true },
            },
          },
        },
      },
    },
  })
  async testSemanticSearch(
    @Body()
    body: {
      query?: string;
      queryEn?: string;
      limit?: number;
    },
  ) {
    const query = (body.query || '').trim();
    const queryEn = (body.queryEn || '').trim();
    if (!query) {
      throw new BadRequestException('query is required');
    }

    if (!this.qdrantService.isConfigured()) {
      throw new BadRequestException('Qdrant is not configured');
    }
    if (!this.embeddingsService.isAvailable()) {
      throw new BadRequestException('Embeddings service is not available');
    }

    const limit = Number.isFinite(body.limit)
      ? Math.max(1, Math.min(50, Number(body.limit)))
      : 10;

    const [rawPrimary, rawResultsEn, mappedResult] = await Promise.all([
      this.searchRawTextWithFallback(query, limit),
      queryEn
        ? this.searchRawTextWithFallback(queryEn, limit).then(
            (result) => result.hits,
          )
        : Promise.resolve(
            [] as Awaited<ReturnType<QdrantService['searchSimilarText']>>,
          ),
      this.catalogSearchService.searchProducts(
        query,
        limit,
        queryEn || undefined,
      ),
    ]);

    const mappedById = new Map(
      mappedResult.products.map((product) => [product.id, product]),
    );
    const isNotNull = <T>(value: T | null): value is T => value !== null;

    const mapRawHit = (
      hit: Awaited<ReturnType<QdrantService['searchSimilarText']>>[number],
    ) => {
      const mapped = mappedById.get(hit.productId);
      const rankingScore = mapped?.rankingScore;
      const hasRankingScore =
        typeof rankingScore === 'number' && Number.isFinite(rankingScore);

      if (DEBUG_FILTER_OUT_UNRANKED_RESULTS && !hasRankingScore) {
        return null;
      }

      return {
        similarity: mapped?.similarity ?? hit.score,
        rankingScore: hasRankingScore ? rankingScore : null,
        productId: hit.productId,
        score: hit.score,
        productName:
          (hit.metadata.product_name as string) ||
          (hit.metadata.name as string) ||
          null,
        retailerId: (hit.metadata.retailer_id as string) || null,
        price:
          typeof hit.metadata.price === 'number' ? hit.metadata.price : null,
        payload: hit.metadata,
      };
    };

    const mergedHitsByProductId = new Map<
      string,
      Awaited<ReturnType<QdrantService['searchSimilarText']>>[number]
    >();
    for (const hit of [...rawPrimary.hits, ...rawResultsEn]) {
      const current = mergedHitsByProductId.get(hit.productId);
      if (!current || hit.score > current.score) {
        mergedHitsByProductId.set(hit.productId, hit);
      }
    }

    const results = [...mergedHitsByProductId.values()]
      .map(mapRawHit)
      .filter(isNotNull);

    return {
      success: true,
      query,
      queryEn: queryEn || null,
      embeddingDimensions: rawPrimary.embeddingDimensions,
      limit,
      internalThreshold: DEBUG_TEXT_SEARCH_THRESHOLD,
      internalRelaxedThreshold: DEBUG_TEXT_SEARCH_RELAXED_THRESHOLD,
      count: results.length,
      results,
      mapped: mappedResult.products,
      mappedError: mappedResult.error,
    };
  }

  private async searchRawTextWithFallback(
    queryText: string,
    limit: number,
  ): Promise<{
    embeddingDimensions: number;
    hits: Awaited<ReturnType<QdrantService['searchSimilarText']>>;
  }> {
    const embedding = await this.embeddingsService.embedText(queryText);
    let hits = await this.qdrantService.searchSimilarText(
      embedding,
      limit,
      DEBUG_TEXT_SEARCH_THRESHOLD,
    );

    if (hits.length === 0) {
      hits = await this.qdrantService.searchSimilarText(
        embedding,
        limit,
        DEBUG_TEXT_SEARCH_RELAXED_THRESHOLD,
      );
    }

    return {
      embeddingDimensions: embedding.length,
      hits,
    };
  }
}
