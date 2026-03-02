import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Service for generating text embeddings using Gemini
 *
 * IMPORTANT: This service is ONLY used for:
 * - Generating query embeddings for vector search in Qdrant
 * - Product embeddings are generated and stored ONLY in Qdrant (not in database)
 *
 * Database storage of embeddings (CatalogProduct.embedding) is deprecated.
 * All embeddings are now stored in Qdrant collections.
 */
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private embeddings: GoogleGenerativeAIEmbeddings | null = null;
  private readonly apiKey: string | null;
  private readonly modelCandidates: string[];
  private activeModelName: string | null = null;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY') || null;
    const configuredModel =
      this.configService.get<string>('GEMINI_EMBEDDING_MODEL')?.trim() ||
      'text-embedding-004';
    this.modelCandidates = [
      ...new Set([
        configuredModel,
        'text-embedding-004',
        'gemini-embedding-001',
      ]),
    ];

    if (!this.apiKey) {
      this.logger.warn(
        'GEMINI_API_KEY not configured - semantic search will be disabled',
      );
      return;
    }

    this.activeModelName = this.modelCandidates[0];
    this.embeddings = this.createEmbeddings(this.activeModelName);
    this.logger.log(`Using Gemini embedding model: ${this.activeModelName}`);
  }

  /**
   * Check if embeddings are available
   */
  isAvailable(): boolean {
    return !!this.apiKey;
  }

  /**
   * Generate embedding for a single text
   */
  async embedText(text: string): Promise<number[]> {
    return this.withModelFallback(async (embeddings) =>
      embeddings.embedQuery(text),
    );
  }

  /**
   * Generate embeddings for multiple texts in batch
   * More efficient than calling embedText multiple times
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      // Process in batches of 10 to avoid rate limits
      const batchSize = 10;
      const results: number[][] = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const embeddings = await this.withModelFallback(async (service) =>
          service.embedDocuments(batch),
        );
        results.push(...embeddings);

        this.logger.debug(
          `Embedded batch ${i / batchSize + 1}/${Math.ceil(texts.length / batchSize)}`,
        );
      }

      return results;
    } catch (error) {
      this.logger.error(
        `Failed to generate batch embeddings: ${error.message}`,
      );
      throw error;
    }
  }

  private createEmbeddings(modelName: string): GoogleGenerativeAIEmbeddings {
    if (!this.apiKey) {
      throw new Error('Gemini embeddings are unavailable (missing API key)');
    }

    return new GoogleGenerativeAIEmbeddings({
      apiKey: this.apiKey,
      modelName,
    });
  }

  private getModelProbeOrder(): string[] {
    if (!this.activeModelName) {
      return this.modelCandidates;
    }

    return [
      this.activeModelName,
      ...this.modelCandidates.filter((model) => model !== this.activeModelName),
    ];
  }

  private isModelUnavailableError(error: unknown): boolean {
    const message = String((error as { message?: unknown })?.message || error)
      .toLowerCase()
      .trim();

    return (
      message.includes('not found') ||
      message.includes('not supported') ||
      message.includes('listmodels')
    );
  }

  private async withModelFallback<T>(
    operation: (embeddings: GoogleGenerativeAIEmbeddings) => Promise<T>,
  ): Promise<T> {
    if (!this.apiKey) {
      throw new Error('Gemini embeddings are unavailable (missing API key)');
    }

    const modelProbeOrder = this.getModelProbeOrder();
    let lastError: unknown;

    for (const modelName of modelProbeOrder) {
      const embeddings =
        this.activeModelName === modelName && this.embeddings
          ? this.embeddings
          : this.createEmbeddings(modelName);

      try {
        const result = await operation(embeddings);

        if (this.activeModelName !== modelName) {
          this.logger.warn(
            `Embedding model "${this.activeModelName}" unavailable, switched to "${modelName}"`,
          );
        }

        this.activeModelName = modelName;
        this.embeddings = embeddings;
        return result;
      } catch (error) {
        lastError = error;

        if (!this.isModelUnavailableError(error)) {
          this.logger.error(`Failed to generate embedding: ${error.message}`);
          throw error;
        }

        this.logger.warn(
          `Embedding model "${modelName}" unavailable, trying fallback...`,
        );
      }
    }

    const fallbackError =
      lastError instanceof Error
        ? lastError
        : new Error(String(lastError || 'Unknown embedding error'));

    this.logger.error(`Failed to generate embedding: ${fallbackError.message}`);
    throw fallbackError;
  }

  /**
   * Calculate cosine similarity between two vectors
   * Returns a value between -1 and 1 (higher = more similar)
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Find top K most similar items based on cosine similarity
   */
  findTopK<T>(
    query: number[],
    items: Array<{ embedding: number[]; data: T }>,
    k: number = 10,
  ): Array<{ data: T; similarity: number }> {
    const scored = items.map((item) => ({
      data: item.data,
      similarity: this.cosineSimilarity(query, item.embedding),
    }));

    // Sort by similarity (descending)
    scored.sort((a, b) => b.similarity - a.similarity);

    return scored.slice(0, k);
  }
}
