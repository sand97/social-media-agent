import { createHash } from 'crypto';

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';

type SearchHit = {
  productId: string;
  score: number;
  metadata: Record<string, unknown>;
};

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);
  private readonly client: QdrantClient;
  private readonly imageCollectionName: string;
  private readonly textCollectionName: string;
  private readonly imageVectorSize: number;
  private readonly textVectorSize: number;
  private readonly autoRecreateOnDimensionMismatch: boolean;

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('QDRANT_API_URL');
    const apiKey = this.configService.get<string>('QDRANT_API_KEY');

    const clientOptions: { url: string; apiKey?: string } = {
      url: url || '',
    };

    if (apiKey) {
      clientOptions.apiKey = apiKey;
    }

    this.client = new QdrantClient(clientOptions);

    this.imageCollectionName =
      this.configService.get<string>('QDRANT_IMAGE_COLLECTION') ||
      this.configService.get<string>('QDRANT_COLLECTION_NAME') ||
      'product-images';

    this.textCollectionName =
      this.configService.get<string>('QDRANT_TEXT_COLLECTION') ||
      'product-text';

    this.imageVectorSize = Number.parseInt(
      this.configService.get<string>('QDRANT_IMAGE_VECTOR_SIZE', '512'),
      10,
    );

    this.textVectorSize = Number.parseInt(
      this.configService.get<string>('QDRANT_TEXT_VECTOR_SIZE', '768'),
      10,
    );

    this.autoRecreateOnDimensionMismatch =
      this.configService.get<string>(
        'QDRANT_AUTO_RECREATE_ON_DIMENSION_MISMATCH',
        'true',
      ) !== 'false';
  }

  async onModuleInit() {
    if (!this.isConfigured()) {
      this.logger.warn(
        'QDRANT_API_URL is not configured. Qdrant features are disabled.',
      );
      return;
    }

    await this.createCollections();
  }

  isConfigured(): boolean {
    return !!this.configService.get<string>('QDRANT_API_URL');
  }

  async createCollections(): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    await this.ensureCollection(this.imageCollectionName, this.imageVectorSize);
    await this.ensureCollection(this.textCollectionName, this.textVectorSize);
  }

  async createCollection(
    collectionName?: string,
    vectorSize = 512,
  ): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Qdrant is not configured');
    }

    const name = collectionName || this.imageCollectionName;
    await this.ensureCollection(name, vectorSize);
  }

  async deleteCollection(collectionName?: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Qdrant is not configured');
    }

    const name = collectionName || this.imageCollectionName;
    await this.client.deleteCollection(name);
  }

  async indexImage(
    productId: number | string,
    embedding: number[],
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.indexProductImage(String(productId), embedding, metadata);
  }

  async indexProductImage(
    productId: string,
    imageEmbedding: number[],
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.indexProductImageVariant(
      productId,
      'cover',
      imageEmbedding,
      metadata,
    );
  }

  async indexProductImageVariant(
    productId: string,
    imageId: string,
    imageEmbedding: number[],
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.upsert(
      this.imageCollectionName,
      this.toImagePointKey(productId, imageId),
      imageEmbedding,
      {
        product_id: productId,
        image_id: imageId,
        ...metadata,
        indexed_at: new Date().toISOString(),
      },
    );
  }

  async indexProductText(
    productId: string,
    textEmbedding: number[],
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.upsert(this.textCollectionName, productId, textEmbedding, {
      product_id: productId,
      ...metadata,
      indexed_at: new Date().toISOString(),
    });
  }

  async indexProductAcrossCollections(data: {
    productId: string;
    imageEmbedding: number[];
    textEmbedding: number[];
    imagePayload: Record<string, unknown>;
    textPayload: Record<string, unknown>;
  }): Promise<void> {
    await Promise.all([
      this.indexProductImage(
        data.productId,
        data.imageEmbedding,
        data.imagePayload,
      ),
      this.indexProductText(
        data.productId,
        data.textEmbedding,
        data.textPayload,
      ),
    ]);
  }

  async searchSimilarImages(
    embedding: number[],
    limit = 5,
    scoreThreshold = 0.7,
  ): Promise<SearchHit[]> {
    return this.searchInCollection(
      this.imageCollectionName,
      embedding,
      limit,
      scoreThreshold,
    );
  }

  async searchSimilarText(
    embedding: number[],
    limit = 5,
    scoreThreshold = 0.7,
  ): Promise<SearchHit[]> {
    return this.searchInCollection(
      this.textCollectionName,
      embedding,
      limit,
      scoreThreshold,
    );
  }

  async deleteProduct(productId: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Qdrant is not configured');
    }

    await Promise.all([
      this.client.delete(this.imageCollectionName, {
        wait: true,
        filter: {
          must: [{ key: 'product_id', match: { value: productId } }],
        },
      }),
      this.client.delete(this.textCollectionName, {
        wait: true,
        filter: {
          must: [{ key: 'product_id', match: { value: productId } }],
        },
      }),
    ]);
  }

  async getCollectionInfo(collectionName?: string) {
    if (!this.isConfigured()) {
      throw new Error('Qdrant is not configured');
    }

    const name = collectionName || this.imageCollectionName;
    return this.client.getCollection(name);
  }

  async deleteStaleProducts(activeProductIds: string[]): Promise<{
    indexed: number;
    stale: number;
    deleted: number;
  }> {
    if (!this.isConfigured()) {
      return { indexed: 0, stale: 0, deleted: 0 };
    }

    const activeSet = new Set(activeProductIds);
    const indexedIds = await this.getIndexedProductIds();
    const staleIds = indexedIds.filter(
      (productId) => !activeSet.has(productId),
    );

    let deleted = 0;
    for (const staleId of staleIds) {
      await this.deleteProduct(staleId);
      deleted += 1;
    }

    return {
      indexed: indexedIds.length,
      stale: staleIds.length,
      deleted,
    };
  }

  private async searchInCollection(
    collectionName: string,
    embedding: number[],
    limit: number,
    scoreThreshold: number,
  ): Promise<SearchHit[]> {
    if (!this.isConfigured()) {
      throw new Error('Qdrant is not configured');
    }

    const result = await this.client.search(collectionName, {
      vector: embedding,
      limit,
      with_payload: true,
      score_threshold: scoreThreshold,
    });

    return result.map((hit) => {
      const payload = (hit.payload || {}) as Record<string, unknown>;
      const payloadProductId = payload.product_id;

      return {
        productId:
          typeof payloadProductId === 'string'
            ? payloadProductId
            : String(hit.id),
        score: hit.score,
        metadata: payload,
      };
    });
  }

  private async getIndexedProductIds(): Promise<string[]> {
    const [imageIds, textIds] = await Promise.all([
      this.collectProductIdsFromCollection(this.imageCollectionName),
      this.collectProductIdsFromCollection(this.textCollectionName),
    ]);

    return Array.from(new Set([...imageIds, ...textIds]));
  }

  private async collectProductIdsFromCollection(
    collectionName: string,
  ): Promise<string[]> {
    const productIds = new Set<string>();
    let offset: string | number | undefined;

    try {
      do {
        const page = await this.client.scroll(collectionName, {
          limit: 256,
          offset,
          with_payload: ['product_id'],
          with_vector: false,
        });

        for (const point of page.points || []) {
          const payload = point.payload as Record<string, unknown> | undefined;
          const payloadProductId = payload?.product_id;
          if (
            typeof payloadProductId === 'string' &&
            payloadProductId.length > 0
          ) {
            productIds.add(payloadProductId);
          }
        }

        offset = page.next_page_offset as string | number | undefined;
      } while (offset !== undefined && offset !== null);
    } catch (error) {
      if (this.isCollectionNotFoundError(error)) {
        return [];
      }
      throw error;
    }

    return Array.from(productIds);
  }

  private async ensureCollection(
    name: string,
    vectorSize: number,
  ): Promise<void> {
    try {
      const info = await this.client.getCollection(name);
      const currentSize = this.extractCollectionVectorSize(info);

      if (currentSize === vectorSize) {
        return;
      }

      this.logger.warn(
        `Collection "${name}" dimension mismatch detected at startup (current=${currentSize}, configured=${vectorSize}). Keeping existing dimension and relying on runtime auto-recovery.`,
      );
      return;
    } catch (error) {
      if (!this.isCollectionNotFoundError(error)) {
        throw error;
      }

      await this.client.createCollection(name, {
        vectors: {
          size: vectorSize,
          distance: 'Cosine',
        },
      });

      this.logger.log(
        `Created Qdrant collection "${name}" (${vectorSize} dims)`,
      );
    }
  }

  private async recreateCollection(
    name: string,
    vectorSize: number,
  ): Promise<void> {
    await this.client.deleteCollection(name);
    await this.client.createCollection(name, {
      vectors: {
        size: vectorSize,
        distance: 'Cosine',
      },
    });

    this.logger.log(
      `Recreated Qdrant collection "${name}" (${vectorSize} dims)`,
    );
  }

  private async upsert(
    collectionName: string,
    productId: string,
    vector: number[],
    payload: Record<string, unknown>,
  ) {
    if (!this.isConfigured()) {
      throw new Error('Qdrant is not configured');
    }

    const pointId = this.toPointId(productId);

    try {
      await this.client.upsert(collectionName, {
        wait: true,
        points: [
          {
            id: pointId,
            vector,
            payload,
          },
        ],
      });
    } catch (error) {
      const dims = this.extractDimensionMismatch(error);

      if (
        dims &&
        this.autoRecreateOnDimensionMismatch &&
        dims.actual === vector.length
      ) {
        this.logger.warn(
          `Qdrant rejected upsert in "${collectionName}" (expected=${dims.expected}, got=${dims.actual}). Recreating collection and retrying.`,
        );

        await this.recreateCollection(collectionName, dims.actual);

        await this.client.upsert(collectionName, {
          wait: true,
          points: [
            {
              id: pointId,
              vector,
              payload,
            },
          ],
        });
        return;
      }

      throw error;
    }
  }

  private toPointId(rawProductId: string): string {
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        rawProductId,
      )
    ) {
      return rawProductId;
    }

    const hash = createHash('sha1').update(rawProductId).digest('hex');
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
  }

  private toImagePointKey(productId: string, imageId: string): string {
    return `${productId}::image::${imageId}`;
  }

  private extractCollectionVectorSize(info: unknown): number {
    const config = (info as { config?: unknown }).config as
      | { params?: { vectors?: unknown } }
      | undefined;
    const vectors = config?.params?.vectors;

    if (typeof vectors === 'object' && vectors !== null && 'size' in vectors) {
      const size = Number((vectors as { size?: unknown }).size);
      if (!Number.isNaN(size)) {
        return size;
      }
    }

    throw new Error('Unable to determine Qdrant collection vector size');
  }

  private extractDimensionMismatch(error: unknown): {
    expected: number;
    actual: number;
  } | null {
    const apiError = error as {
      message?: unknown;
      data?: { status?: { error?: unknown } };
    };
    const message = String(apiError?.message || error);
    const details = String(apiError?.data?.status?.error || '');
    const raw = `${message} ${details}`;
    const match = raw.match(/expected dim:\s*(\d+),\s*got\s*(\d+)/i);

    if (!match) {
      return null;
    }

    return {
      expected: Number.parseInt(match[1], 10),
      actual: Number.parseInt(match[2], 10),
    };
  }

  private isCollectionNotFoundError(error: unknown): boolean {
    const message = String((error as { message?: unknown })?.message || error);
    return /not found/i.test(message);
  }
}
