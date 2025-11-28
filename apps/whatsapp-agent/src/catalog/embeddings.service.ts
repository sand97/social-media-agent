import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Service for generating embeddings using Gemini
 * Used for semantic search in the product catalog
 */
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private embeddings: GoogleGenerativeAIEmbeddings;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      this.logger.warn(
        'GEMINI_API_KEY not configured - semantic search will be disabled',
      );
    }

    // Initialize Gemini embeddings
    // text-embedding-004 is free and produces 768-dimensional vectors
    this.embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey,
      modelName: 'text-embedding-004',
    });
  }

  /**
   * Check if embeddings are available
   */
  isAvailable(): boolean {
    return !!this.configService.get<string>('GEMINI_API_KEY');
  }

  /**
   * Generate embedding for a single text
   */
  async embedText(text: string): Promise<number[]> {
    try {
      const embedding = await this.embeddings.embedQuery(text);
      return embedding;
    } catch (error) {
      this.logger.error(`Failed to generate embedding: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * More efficient than calling embedText multiple times
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      // Process in batches of 10 to avoid rate limits
      const batchSize = 10;
      const results: number[][] = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const embeddings = await this.embeddings.embedDocuments(batch);
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
