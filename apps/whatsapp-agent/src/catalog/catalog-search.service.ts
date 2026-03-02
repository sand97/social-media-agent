import { EmbeddingsService } from '@app/catalog-shared/embeddings.service';
import { QdrantService } from '@app/image-processing/qdrant.service';
import { Injectable, Logger } from '@nestjs/common';

const GENERIC_COVER_EN_TOKENS = new Set([
  'jersey',
  'football',
  'shirt',
  'kit',
  'home',
  'away',
  'training',
  'match',
]);

const TEXT_VECTOR_SCORE_THRESHOLD = 0.2;
const TEXT_VECTOR_RELAXED_SCORE_THRESHOLD = 0.12;
const TOP_RANKING_MIN_RATIO = 0.5;
const REQUIRE_RANKING_SCORE_FOR_AGENT_RESULTS = true;

export interface ProductSearchResult {
  id: string;
  name: string;
  description?: string;
  price?: number;
  currency?: string;
  availability?: string;
  collectionName?: string;
  similarity?: number; // Only present for vector search
  rankingScore?: number; // Hybrid rerank score (semantic + lexical)
}

type CatalogSearchHit = {
  productId: string;
  score: number;
  metadata: Record<string, unknown>;
  primaryScore?: number;
  englishScore?: number;
  __rankingScore?: number;
};

/**
 * Service for searching products using Qdrant semantic search.
 */
@Injectable()
export class CatalogSearchService {
  private readonly logger = new Logger(CatalogSearchService.name);

  constructor(
    private readonly embeddings: EmbeddingsService,
    private readonly qdrantService: QdrantService,
  ) {}

  /**
   * Search products via vector search in Qdrant.
   */
  async searchProducts(
    query: string,
    limit: number = 10,
    queryEn?: string,
  ): Promise<{
    success: boolean;
    products: ProductSearchResult[];
    error?: string;
  }> {
    try {
      if (!this.qdrantService.isConfigured()) {
        return {
          success: false,
          products: [],
          error: 'Qdrant is not configured',
        };
      }

      if (!this.embeddings.isAvailable()) {
        return {
          success: false,
          products: [],
          error: 'Embeddings service is not available',
        };
      }

      return await this.searchVector(query, limit, queryEn);
    } catch (error) {
      this.logger.error(`Search failed: ${error.message}`);
      return {
        success: false,
        products: [],
        error: error.message,
      };
    }
  }

  /**
   * Vector search using Qdrant
   */
  private async searchVector(
    query: string,
    limit: number,
    queryEn?: string,
  ): Promise<{
    success: boolean;
    products: ProductSearchResult[];
    error?: string;
  }> {
    const trimmedQuery = query.trim();
    const trimmedQueryEn = queryEn?.trim();
    const normalizedQuery = this.normalizeForMatch(trimmedQuery);
    const normalizedQueryEn = trimmedQueryEn
      ? this.normalizeForMatch(trimmedQueryEn)
      : '';
    const sameIntent =
      Boolean(trimmedQueryEn) && normalizedQueryEn === normalizedQuery;
    const candidateLimit = Math.max(limit, Math.min(limit * 3, 50));
    this.logger.debug(
      `🔍 Vector search for query="${trimmedQuery}" query_en="${trimmedQueryEn || ''}" (limit=${limit}, candidateLimit=${candidateLimit}, threshold=${TEXT_VECTOR_SCORE_THRESHOLD})`,
    );

    const [primarySearch, englishSearch] = await Promise.all([
      this.searchByTextQuery(trimmedQuery, candidateLimit),
      trimmedQueryEn && !sameIntent
        ? this.searchByTextQuery(trimmedQueryEn, candidateLimit)
        : Promise.resolve({
            hits: [] as Awaited<ReturnType<QdrantService['searchSimilarText']>>,
          }),
    ]);
    const englishHits = trimmedQueryEn
      ? sameIntent
        ? primarySearch.hits
        : englishSearch.hits
      : [];

    const mergedHits = this.mergeHits(primarySearch.hits, englishHits);
    const rerankedResults = this.rerankResults(
      trimmedQuery,
      trimmedQueryEn,
      mergedHits,
    );
    const filteredResults = this.filterByTopRankingProximity(
      rerankedResults,
      limit,
    );

    // Map to ProductSearchResult
    const products: ProductSearchResult[] = filteredResults.map((hit) => ({
      id: hit.productId,
      name:
        (hit.metadata.product_name as string) ||
        (hit.metadata.name as string) ||
        '',
      description: (hit.metadata.description as string) || undefined,
      price: (hit.metadata.price as number) || undefined,
      currency: (hit.metadata.currency as string) || undefined,
      availability: (hit.metadata.availability as string) || undefined,
      collectionName: (hit.metadata.collectionName as string) || undefined,
      similarity: hit.score,
      rankingScore:
        typeof (hit as any).__rankingScore === 'number'
          ? (hit as any).__rankingScore
          : undefined,
    }));
    const sanitizedProducts = this.filterProductsWithoutRankingScore(products);

    this.logger.debug(
      `✅ Found ${sanitizedProducts.length} results via vector search`,
    );

    return {
      success: true,
      products: sanitizedProducts,
    };
  }

  /**
   * Hybrid reranking: keep semantic recall but prioritize lexical/entity matches.
   * This avoids cases where a club/team name query ranks semantically related but wrong items too high.
   */
  private rerankResults(
    query: string,
    queryEn: string | undefined,
    hits: CatalogSearchHit[],
  ): CatalogSearchHit[] {
    const normalizedQuery = this.normalizeForMatch(query);
    const normalizedQueryEn = queryEn ? this.normalizeForMatch(queryEn) : '';
    const queryTokens = Array.from(
      new Set(
        normalizedQuery
          .split(/\s+/)
          .map((token) => token.trim())
          .filter((token) => token.length >= 3),
      ),
    );
    const queryEnTokens = Array.from(
      new Set(
        normalizedQueryEn
          .split(/\s+/)
          .map((token) => token.trim())
          .filter((token) => token.length >= 3),
      ),
    );
    const queryEnPriorityTokens = queryEnTokens.filter(
      (token) => !GENERIC_COVER_EN_TOKENS.has(token),
    );
    const queryEnTokensForCover =
      queryEnPriorityTokens.length > 0 ? queryEnPriorityTokens : queryEnTokens;

    if (queryTokens.length === 0 && queryEnTokens.length === 0) {
      return hits;
    }

    const reranked = hits.map((hit) => {
      const productName = this.normalizeForMatch(
        ((hit.metadata.product_name as string) ||
          (hit.metadata.name as string) ||
          '') as string,
      );
      const description = this.normalizeForMatch(
        ((hit.metadata.description as string) || '') as string,
      );
      const coverImageDescription = this.normalizeForMatch(
        ((hit.metadata.cover_image_description as string) || '') as string,
      );

      const fullQueryInName = Boolean(
        normalizedQuery && productName.includes(normalizedQuery),
      );
      const fullQueryInDescription = Boolean(
        normalizedQuery && description.includes(normalizedQuery),
      );

      const tokenMatchesInName = queryTokens.reduce(
        (count, token) => count + (productName.includes(token) ? 1 : 0),
        0,
      );
      const tokenMatchesInDescription = queryTokens.reduce(
        (count, token) => count + (description.includes(token) ? 1 : 0),
        0,
      );
      const fullQueryEnInCover = Boolean(
        normalizedQueryEn && coverImageDescription.includes(normalizedQueryEn),
      );
      const tokenMatchesEnInCover = queryEnTokensForCover.reduce(
        (count, token) =>
          count + (coverImageDescription.includes(token) ? 1 : 0),
        0,
      );
      const tokenMatchesEnInDescription = queryEnTokensForCover.reduce(
        (count, token) => count + (description.includes(token) ? 1 : 0),
        0,
      );

      const hasLexicalMatch =
        fullQueryInName ||
        fullQueryInDescription ||
        tokenMatchesInName > 0 ||
        tokenMatchesInDescription > 0 ||
        fullQueryEnInCover ||
        tokenMatchesEnInCover > 0 ||
        tokenMatchesEnInDescription > 0;

      // Tuned lightweight boost/penalty to preserve semantic behavior while fixing entity queries.
      const primaryLexicalBoost =
        (fullQueryInName ? 0.35 : 0) +
        (fullQueryInDescription ? 0.12 : 0) +
        Math.min(
          0.3,
          tokenMatchesInName * 0.14 + tokenMatchesInDescription * 0.04,
        );
      // query_en is primarily intended for english cover-image caption matching.
      const englishLexicalBoost =
        (fullQueryEnInCover ? 0.45 : 0) +
        Math.min(
          0.35,
          tokenMatchesEnInCover * 0.16 + tokenMatchesEnInDescription * 0.04,
        );
      const hasEnglishLexicalSignal =
        fullQueryEnInCover || tokenMatchesEnInCover > 0;
      const lexicalPenalty = hasLexicalMatch
        ? queryEnTokens.length > 0 && !hasEnglishLexicalSignal
          ? 0.18
          : 0
        : 0.2;
      const primarySemanticScore = hit.primaryScore ?? 0;
      const englishSemanticScore = hit.englishScore ?? 0;
      // query_en has priority only when english lexical signals are present.
      const englishCoverage =
        queryEnTokensForCover.length > 0
          ? tokenMatchesEnInCover / Math.max(queryEnTokensForCover.length, 1)
          : 0;
      const englishSemanticWeight =
        queryEnTokens.length === 0
          ? 0
          : fullQueryEnInCover
            ? 0.85
            : englishCoverage > 0
              ? 0.55
              : 0.08;
      const semanticScore =
        primarySemanticScore + englishSemanticScore * englishSemanticWeight;

      const rankingScore =
        semanticScore +
        primaryLexicalBoost +
        englishLexicalBoost -
        lexicalPenalty;

      return {
        ...hit,
        __rankingScore: rankingScore,
      };
    });

    reranked.sort((a, b) => b.__rankingScore - a.__rankingScore);

    this.logger.debug(
      `🔎 Reranked top results for "${query}": ${reranked
        .slice(0, 3)
        .map((hit) => {
          const name =
            (hit.metadata.product_name as string) ||
            (hit.metadata.name as string) ||
            hit.productId;
          return `${name} (vector=${hit.score.toFixed(3)}, rank=${hit.__rankingScore.toFixed(3)})`;
        })
        .join(' | ')}`,
    );

    return reranked;
  }

  private async searchByTextQuery(queryText: string, limit: number) {
    const embedding = await this.embeddings.embedText(queryText);
    let hits = await this.qdrantService.searchSimilarText(
      embedding,
      limit,
      TEXT_VECTOR_SCORE_THRESHOLD,
    );

    if (hits.length === 0) {
      this.logger.debug(
        `🔁 No result for "${queryText}" with threshold=${TEXT_VECTOR_SCORE_THRESHOLD}. Retrying with threshold=${TEXT_VECTOR_RELAXED_SCORE_THRESHOLD}`,
      );
      hits = await this.qdrantService.searchSimilarText(
        embedding,
        limit,
        TEXT_VECTOR_RELAXED_SCORE_THRESHOLD,
      );
    }

    return { hits };
  }

  private filterByTopRankingProximity(
    hits: CatalogSearchHit[],
    limit: number,
  ): CatalogSearchHit[] {
    if (hits.length === 0) {
      return [];
    }

    const topRankingScore = hits[0].__rankingScore;
    if (
      typeof topRankingScore !== 'number' ||
      !Number.isFinite(topRankingScore)
    ) {
      return hits.slice(0, limit);
    }

    const minAllowedRanking =
      topRankingScore > 0
        ? topRankingScore * TOP_RANKING_MIN_RATIO
        : topRankingScore;

    const filteredHits = hits.filter(
      (hit, index) =>
        index === 0 ||
        (typeof hit.__rankingScore === 'number' &&
          hit.__rankingScore >= minAllowedRanking),
    );

    this.logger.debug(
      `🎯 Relative ranking filter applied: top=${topRankingScore.toFixed(3)}, minAllowed=${minAllowedRanking.toFixed(3)}, kept=${filteredHits.length}/${hits.length}`,
    );

    return filteredHits.slice(0, limit);
  }

  private filterProductsWithoutRankingScore(
    products: ProductSearchResult[],
  ): ProductSearchResult[] {
    if (!REQUIRE_RANKING_SCORE_FOR_AGENT_RESULTS) {
      return products;
    }

    const filteredProducts = products.filter(
      (product) =>
        typeof product.rankingScore === 'number' &&
        Number.isFinite(product.rankingScore),
    );

    const dropped = products.length - filteredProducts.length;
    if (dropped > 0) {
      this.logger.warn(
        `⚠️ Dropped ${dropped} product(s) without rankingScore before returning search results`,
      );
    }

    return filteredProducts;
  }

  private mergeHits(
    primaryHits: Awaited<ReturnType<QdrantService['searchSimilarText']>>,
    englishHits: Awaited<ReturnType<QdrantService['searchSimilarText']>>,
  ): CatalogSearchHit[] {
    const merged = new Map<string, CatalogSearchHit>();

    for (const hit of primaryHits) {
      merged.set(hit.productId, {
        productId: hit.productId,
        score: hit.score,
        metadata: hit.metadata,
        primaryScore: hit.score,
      });
    }

    for (const hit of englishHits) {
      const existing = merged.get(hit.productId);
      if (!existing) {
        merged.set(hit.productId, {
          productId: hit.productId,
          score: hit.score,
          metadata: hit.metadata,
          englishScore: hit.score,
        });
        continue;
      }

      existing.englishScore = Math.max(existing.englishScore ?? 0, hit.score);
      existing.score = Math.max(existing.score, hit.score);
    }

    return [...merged.values()];
  }

  private normalizeForMatch(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }
}
