import { InternalProductMatch } from '@app/backend-client/backend-api.types';
import { BackendClientService } from '@app/backend-client/backend-client.service';
import { EmbeddingsService } from '@app/catalog-shared/embeddings.service';
import { Injectable, Logger } from '@nestjs/common';

import { GeminiVisionService } from './gemini-vision.service';
import { ImageEmbeddingsService } from './image-embeddings.service';
import { OcrService } from './ocr.service';
import { QdrantService } from './qdrant.service';
import { SmartCropService } from './smart-crop.service';

export type ImageSearchMethod =
  | 'ocr_keywords'
  | 'qdrant_image'
  | 'qdrant_text'
  | 'none'
  | 'error';

interface ImageProductMatchingInput {
  imageBuffer: Buffer;
  messageBody?: string;
  thresholds?: {
    image?: number;
    text?: number;
  };
  context?: {
    messageId?: string;
    chatId?: string;
  };
}

interface ImageAgentPayload {
  body: string;
  imageProducts: InternalProductMatch[];
  imageSearchMethod: ImageSearchMethod;
  imageOcrText: string;
  imageGeminiDescription: string;
  imageContextBlock: string;
}

export interface ImageProductMatchingResult {
  searchMethod: ImageSearchMethod;
  confidence: number | null;
  similarity: number | null;
  ocrText: string;
  keywords: string[];
  matchedKeywords: string[];
  matchedProducts: InternalProductMatch[];
  geminiDescription: string;
  croppedSuccessfully: boolean;
  cropMethod: 'none' | 'opencv';
  productsFound: number;
  error?: string;
  agentPayload: ImageAgentPayload;
}

@Injectable()
export class ImageProductMatchingService {
  private readonly logger = new Logger(ImageProductMatchingService.name);
  private static readonly MAX_PRODUCTS_IN_CONTEXT = 5;

  constructor(
    private readonly backendClient: BackendClientService,
    private readonly ocrService: OcrService,
    private readonly qdrantService: QdrantService,
    private readonly imageEmbeddings: ImageEmbeddingsService,
    private readonly textEmbeddings: EmbeddingsService,
    private readonly smartCropService: SmartCropService,
    private readonly geminiVisionService: GeminiVisionService,
  ) {}

  async matchIncomingImage(
    input: ImageProductMatchingInput,
  ): Promise<ImageProductMatchingResult> {
    const imageThreshold = this.resolveThreshold(
      input.thresholds?.image,
      process.env.QDRANT_IMAGE_THRESHOLD,
      0.8,
    );
    const textThreshold = this.resolveThreshold(
      input.thresholds?.text,
      process.env.QDRANT_TEXT_THRESHOLD,
      0.8,
    );

    let searchMethod: ImageSearchMethod = 'none';
    let confidence: number | null = null;
    let similarity: number | null = null;
    let ocrText = '';
    let keywords: string[] = [];
    let matchedKeywords: string[] = [];
    let matchedProducts: InternalProductMatch[] = [];
    let geminiDescription = '';
    let croppedSuccessfully = false;
    let cropMethod: 'none' | 'opencv' = 'none';
    let imageForSimilarity = input.imageBuffer;
    let errorMessage: string | undefined;

    try {
      ocrText = await this.ocrService.extractText(input.imageBuffer);
      keywords = this.extractWords(ocrText);

      if (keywords.length > 0) {
        const ocrSearch = await this.backendClient.searchProductsByKeywords({
          keywords,
        });

        matchedKeywords = ocrSearch.matchedKeywords || [];
        if (ocrSearch.products.length > 0) {
          matchedProducts = ocrSearch.products.slice(
            0,
            ImageProductMatchingService.MAX_PRODUCTS_IN_CONTEXT,
          );
          searchMethod = 'ocr_keywords';
          confidence = 1;
          similarity = 1;
        }
      }

      if (!matchedProducts.length) {
        imageForSimilarity = await this.smartCropService.cropOpenCV(
          input.imageBuffer,
        );
        croppedSuccessfully = imageForSimilarity !== input.imageBuffer;
        cropMethod = 'opencv';
      }

      if (
        !matchedProducts.length &&
        this.qdrantService.isConfigured() &&
        this.imageEmbeddings.isReady()
      ) {
        const imageEmbedding =
          await this.imageEmbeddings.generateEmbedding(imageForSimilarity);
        const qdrantImageMatches = await this.qdrantService.searchSimilarImages(
          imageEmbedding,
          ImageProductMatchingService.MAX_PRODUCTS_IN_CONTEXT,
          imageThreshold,
        );

        if (qdrantImageMatches.length > 0) {
          matchedProducts = qdrantImageMatches.map((hit) =>
            this.toInternalProductMatch(hit.productId, hit.metadata),
          );
          searchMethod = 'qdrant_image';
          confidence = qdrantImageMatches[0].score;
          similarity = qdrantImageMatches[0].score;
        }
      }

      if (
        !matchedProducts.length &&
        this.qdrantService.isConfigured() &&
        this.textEmbeddings.isAvailable()
      ) {
        geminiDescription =
          await this.geminiVisionService.describeProductImage(
            imageForSimilarity,
          );
        const textEmbedding =
          await this.textEmbeddings.embedText(geminiDescription);
        const qdrantTextMatches = await this.qdrantService.searchSimilarText(
          textEmbedding,
          ImageProductMatchingService.MAX_PRODUCTS_IN_CONTEXT,
          textThreshold,
        );

        if (qdrantTextMatches.length > 0) {
          matchedProducts = qdrantTextMatches.map((hit) =>
            this.toInternalProductMatch(hit.productId, hit.metadata),
          );
          searchMethod = 'qdrant_text';
          confidence = qdrantTextMatches[0].score;
          similarity = qdrantTextMatches[0].score;
        }
      }
    } catch (error: any) {
      searchMethod = 'error';
      errorMessage = String(error?.message || error || 'unknown error');
      this.logger.error(
        `Image pipeline failed (messageId=${input.context?.messageId || 'n/a'}, chatId=${input.context?.chatId || 'n/a'}): ${errorMessage}`,
      );
    }

    const imageContextBlock = this.buildImageContextBlock({
      searchMethod,
      matchedProducts,
      matchedKeywords,
      confidence,
      ocrText,
      geminiDescription,
    });

    return {
      searchMethod,
      confidence,
      similarity,
      ocrText,
      keywords,
      matchedKeywords,
      matchedProducts,
      geminiDescription,
      croppedSuccessfully,
      cropMethod,
      productsFound: matchedProducts.length,
      error: errorMessage,
      agentPayload: {
        body: this.mergeImageContextIntoMessage(
          input.messageBody,
          imageContextBlock,
        ),
        imageProducts: matchedProducts,
        imageSearchMethod: searchMethod,
        imageOcrText: ocrText,
        imageGeminiDescription: geminiDescription,
        imageContextBlock,
      },
    };
  }

  private extractWords(text: string): string[] {
    if (!text) {
      return [];
    }

    return Array.from(
      new Set(
        text
          .split('\n')
          .map((token) => token.trim().toLowerCase())
          .filter((token) => token.length > 0),
      ),
    );
  }

  private buildImageContextBlock(data: {
    searchMethod: ImageSearchMethod;
    matchedProducts: InternalProductMatch[];
    matchedKeywords: string[];
    confidence: number | null;
    ocrText: string;
    geminiDescription: string;
  }): string {
    const confidencePercent =
      typeof data.confidence === 'number'
        ? `${(data.confidence * 100).toFixed(1)}%`
        : 'N/A';

    if (data.matchedProducts.length > 0) {
      const primary = data.matchedProducts[0];
      const productsLine = data.matchedProducts
        .map((product) => `${product.name} (${product.id})`)
        .join(' | ');

      return [
        '[IMAGE_CONTEXT]',
        `search_method=${data.searchMethod}`,
        `products_found=${data.matchedProducts.length}`,
        `products=${productsLine}`,
        `primary_product_id=${primary.id}`,
        `primary_product_name=${primary.name}`,
        `retailer_id=${primary.retailer_id || 'N/A'}`,
        `matched_keywords=${data.matchedKeywords.join(',') || 'N/A'}`,
        `confidence=${confidencePercent}`,
        'instruction=Confirme avec le contact si ce produit correspond bien à son image.',
      ].join('\n');
    }

    return [
      '[IMAGE_CONTEXT]',
      `search_method=${data.searchMethod}`,
      'products_found=0',
      `ocr_excerpt=${data.ocrText.slice(0, 160) || 'N/A'}`,
      `gemini_description=${data.geminiDescription || 'N/A'}`,
      'instruction=Aucun produit identifié avec confiance suffisante. Continue la conversation normalement.',
    ].join('\n');
  }

  private mergeImageContextIntoMessage(
    messageBody: string | undefined,
    imageContextBlock: string,
  ): string {
    const baseText = messageBody?.trim() || '[Image envoyée par le contact]';
    return `${baseText}\n\n${imageContextBlock}`;
  }

  private toInternalProductMatch(
    productId: string,
    metadata: Record<string, unknown>,
  ): InternalProductMatch {
    return {
      id: productId,
      name: this.toOptionalString(metadata.product_name) || 'Produit identifié',
      description: this.toOptionalString(metadata.description),
      retailer_id: this.toOptionalString(metadata.retailer_id),
      coverImageDescription:
        this.toOptionalString(metadata.cover_image_description) ||
        this.toOptionalString(metadata.image_description),
      category: this.toOptionalString(metadata.category),
      price:
        typeof metadata.price === 'number'
          ? metadata.price
          : Number.isFinite(Number(metadata.price))
            ? Number(metadata.price)
            : null,
    };
  }

  private toOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private resolveThreshold(
    explicit: number | undefined,
    envValue: string | undefined,
    fallback: number,
  ): number {
    if (typeof explicit === 'number' && explicit > 0 && explicit <= 1) {
      return explicit;
    }

    const parsed = Number.parseFloat(envValue || '');
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
      return fallback;
    }

    return parsed;
  }
}
