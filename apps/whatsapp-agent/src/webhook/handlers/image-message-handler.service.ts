import { BackendClientService } from '@app/backend-client/backend-client.service';
import { InternalProductMatch } from '@app/backend-client/backend-api.types';
import { EmbeddingsService } from '@app/catalog/embeddings.service';
import { GeminiVisionService } from '@app/image-processing/gemini-vision.service';
import { ImageEmbeddingsService } from '@app/image-processing/image-embeddings.service';
import { OcrService } from '@app/image-processing/ocr.service';
import { QdrantService } from '@app/image-processing/qdrant.service';
import { SmartCropService } from '@app/image-processing/smart-crop.service';
import { WhatsAppAgentService } from '@app/langchain/whatsapp-agent.service';
import { AdminGroupMessagingService } from '@app/tools/chat/admin-group-messaging.service';
import { Injectable, Logger } from '@nestjs/common';

import { stripAndSanitizeWaId } from '../utils/wa-id.utils';

type ImageSearchMethod =
  | 'ocr_keywords'
  | 'qdrant_image'
  | 'qdrant_text'
  | 'none'
  | 'error';

@Injectable()
export class ImageMessageHandlerService {
  private readonly logger = new Logger(ImageMessageHandlerService.name);

  constructor(
    private readonly backendClient: BackendClientService,
    private readonly ocrService: OcrService,
    private readonly qdrantService: QdrantService,
    private readonly imageEmbeddings: ImageEmbeddingsService,
    private readonly textEmbeddings: EmbeddingsService,
    private readonly smartCropService: SmartCropService,
    private readonly geminiVisionService: GeminiVisionService,
    private readonly agentService: WhatsAppAgentService,
    private readonly adminGroupMessagingService: AdminGroupMessagingService,
  ) {}

  async handleInline(messageData: any[], userId?: string): Promise<void> {
    const [message] = messageData || [];
    const chatId = message?.from || 'unknown';

    if (
      !message?.downloadedMedia?.data ||
      !message?.downloadedMedia?.mimetype
    ) {
      this.logger.warn(
        `Image inline requested but no media on message ${message?.id?._serialized}`,
      );
      return;
    }

    const messageId = message?.id?._serialized || message?.id || 'unknown';

    const upload = await this.backendClient.uploadMedia({
      messageId,
      chatId,
      userId,
      mediaBase64: message.downloadedMedia.data,
      mimeType: message.downloadedMedia.mimetype,
      filename: message.downloadedMedia.filename,
      userPhoneNumber: stripAndSanitizeWaId(userId),
      contactPhoneNumber: stripAndSanitizeWaId(
        message?.contactId || chatId || undefined,
      ),
    });

    const originalImageBuffer = Buffer.from(message.downloadedMedia.data, 'base64');
    let imageToProcess: Buffer<ArrayBufferLike> = originalImageBuffer;
    let croppedSuccessfully = false;
    let ocrText = '';
    let keywords: string[] = [];
    let geminiDescription = '';
    let searchMethod: ImageSearchMethod = 'none';
    let confidence: number | null = null;
    let matchedKeywords: string[] = [];
    let matchedProduct: InternalProductMatch | null = null;

    try {
      imageToProcess = await this.smartCropService.cropOpenCV(originalImageBuffer);
      croppedSuccessfully = imageToProcess !== originalImageBuffer;

      ocrText = await this.ocrService.extractText(imageToProcess);
      keywords = this.extractWords(ocrText);

      if (keywords.length > 0) {
        const ocrSearch = await this.backendClient.searchProductsByKeywords({
          keywords,
        });

        if (ocrSearch.products.length > 0) {
          matchedProduct = ocrSearch.products[0];
          matchedKeywords = ocrSearch.matchedKeywords;
          searchMethod = 'ocr_keywords';
          confidence = 1;
        }
      }

      if (
        !matchedProduct &&
        this.qdrantService.isConfigured() &&
        this.imageEmbeddings.isReady()
      ) {
        const imageThreshold = this.getThreshold('QDRANT_IMAGE_THRESHOLD', 0.8);
        const clipEmbedding = await this.imageEmbeddings.generateEmbedding(
          imageToProcess,
        );
        const qdrantImageMatches = await this.qdrantService.searchSimilarImages(
          clipEmbedding,
          1,
          imageThreshold,
        );

        if (qdrantImageMatches.length > 0) {
          const bestMatch = qdrantImageMatches[0];
          matchedProduct = {
            id: bestMatch.productId,
            name:
              this.toOptionalString(bestMatch.metadata.product_name) ||
              'Produit identifié',
            description: this.toOptionalString(bestMatch.metadata.description),
            retailer_id: this.toOptionalString(bestMatch.metadata.retailer_id),
            coverImageDescription: this.toOptionalString(
              bestMatch.metadata.cover_image_description,
            ),
            category: this.toOptionalString(bestMatch.metadata.category),
            price:
              typeof bestMatch.metadata.price === 'number'
                ? bestMatch.metadata.price
                : null,
          };
          searchMethod = 'qdrant_image';
          confidence = bestMatch.score;
        }
      }

      if (!matchedProduct && this.qdrantService.isConfigured()) {
        geminiDescription =
          await this.geminiVisionService.describeProductImage(imageToProcess);

        const textEmbedding = await this.textEmbeddings.embedText(geminiDescription);
        const textThreshold = this.getThreshold('QDRANT_TEXT_THRESHOLD', 0.8);
        const qdrantTextMatches = await this.qdrantService.searchSimilarText(
          textEmbedding,
          1,
          textThreshold,
        );

        if (qdrantTextMatches.length > 0) {
          const bestMatch = qdrantTextMatches[0];
          matchedProduct = {
            id: bestMatch.productId,
            name:
              this.toOptionalString(bestMatch.metadata.product_name) ||
              'Produit identifié',
            description: this.toOptionalString(bestMatch.metadata.description),
            retailer_id: this.toOptionalString(bestMatch.metadata.retailer_id),
            coverImageDescription: this.toOptionalString(
              bestMatch.metadata.cover_image_description,
            ),
            category: this.toOptionalString(bestMatch.metadata.category),
            price:
              typeof bestMatch.metadata.price === 'number'
                ? bestMatch.metadata.price
                : null,
          };
          searchMethod = 'qdrant_text';
          confidence = bestMatch.score;
        }
      }
    } catch (error: any) {
      searchMethod = 'error';
      this.logger.error(`Image pipeline failed for ${messageId}: ${error?.message}`);
    }

    const matchedProducts = matchedProduct ? [matchedProduct] : [];
    const imageContextBlock = this.buildImageContextBlock({
      searchMethod,
      matchedProduct,
      confidence,
      ocrText,
      geminiDescription,
    });

    await this.backendClient.upsertMessageMetadata({
      messageId,
      type: 'IMAGE',
      metadata: {
        searchMethod,
        confidence,
        ocrText,
        keywords,
        matchedKeywords,
        matchedProducts,
        geminiDescription,
        croppedSuccessfully,
        productsFound: matchedProducts.length,
        mediaUrl: upload.url,
        objectKey: upload.objectKey,
      },
    });

    if (!matchedProduct) {
      await this.notifyAdminImageFailure({
        messageId,
        chatId,
        contactId: message?.contactId,
        ocrText,
        geminiDescription,
      });
    }

    (message as any).imageProducts = matchedProducts;
    (message as any).imageSearchMethod = searchMethod;
    (message as any).imageOcrText = ocrText;
    (message as any).imageGeminiDescription = geminiDescription;
    (message as any).body = this.mergeImageContextIntoMessage(
      message?.body,
      imageContextBlock,
    );

    if (upload.objectKey) {
      try {
        await this.backendClient.deleteMedia({ objectKey: upload.objectKey });
        this.logger.debug(`Deleted image ${upload.objectKey} from MinIO`);
      } catch (error: any) {
        this.logger.warn(
          `Unable to delete media ${upload.objectKey}: ${error.message}`,
        );
      }
    }

    (message as any).mediaUrl = upload.url;
    (message as any).mediaKind = 'image';

    await this.agentService.processIncomingMessage(messageData, userId);
  }

  private extractWords(text: string): string[] {
    if (!text) {
      return [];
    }

    return text
      .split(/[^a-zA-Z0-9_-]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
  }

  private buildImageContextBlock(data: {
    searchMethod: ImageSearchMethod;
    matchedProduct: InternalProductMatch | null;
    confidence: number | null;
    ocrText: string;
    geminiDescription: string;
  }): string {
    const confidencePercent =
      typeof data.confidence === 'number'
        ? `${(data.confidence * 100).toFixed(1)}%`
        : 'N/A';

    if (data.matchedProduct) {
      return [
        '[IMAGE_CONTEXT]',
        `search_method=${data.searchMethod}`,
        `product_id=${data.matchedProduct.id}`,
        `product_name=${data.matchedProduct.name}`,
        `confidence=${confidencePercent}`,
        `retailer_id=${data.matchedProduct.retailer_id || 'N/A'}`,
        `instruction=Confirme avec le contact si ce produit correspond bien à son image.`,
      ].join('\n');
    }

    return [
      '[IMAGE_CONTEXT]',
      `search_method=${data.searchMethod}`,
      'product_id=NOT_FOUND',
      `ocr_excerpt=${data.ocrText.slice(0, 120) || 'N/A'}`,
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

  private async notifyAdminImageFailure(data: {
    messageId: string;
    chatId: string;
    contactId?: string;
    ocrText: string;
    geminiDescription: string;
  }): Promise<void> {
    try {
      const managementGroup = await this.backendClient.getManagementGroup();
      if (!managementGroup.managementGroupId) {
        this.logger.warn(
          `No management group configured for image failure notification (${data.messageId})`,
        );
        return;
      }

      const adminMessage = [
        'Alerte image non identifiee',
        `message_id: ${data.messageId}`,
        `chat_id: ${data.chatId}`,
        `ocr: ${data.ocrText.slice(0, 180) || 'N/A'}`,
        `gemini: ${data.geminiDescription.slice(0, 180) || 'N/A'}`,
      ].join('\n');

      await this.adminGroupMessagingService.sendToManagementGroup({
        managementGroupId: managementGroup.managementGroupId,
        message: adminMessage,
        chatId: data.chatId,
        contactId: data.contactId,
        shouldReplyToUser: false,
      });
    } catch (error: any) {
      this.logger.warn(
        `Failed to notify management group for image failure: ${error?.message || error}`,
      );
    }
  }

  private getThreshold(envName: string, fallback: number): number {
    const raw = process.env[envName];
    if (!raw) {
      return fallback;
    }

    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
      return fallback;
    }

    return parsed;
  }

  private toOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
}
