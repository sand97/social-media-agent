import { BackendClientService } from '@app/backend-client/backend-client.service';
import { ImageProductMatchingService } from '@app/image-processing/image-product-matching.service';
import { WhatsAppAgentService } from '@app/langchain/whatsapp-agent.service';
import { MessageMetadataService } from '@app/message-metadata/message-metadata.service';
import { AdminGroupMessagingService } from '@app/tools/chat/admin-group-messaging.service';
import { Injectable, Logger } from '@nestjs/common';

import { stripAndSanitizeWaId } from '../utils/wa-id.utils';

@Injectable()
export class ImageMessageHandlerService {
  private readonly logger = new Logger(ImageMessageHandlerService.name);

  constructor(
    private readonly backendClient: BackendClientService,
    private readonly imageProductMatchingService: ImageProductMatchingService,
    private readonly messageMetadata: MessageMetadataService,
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

    const upload = await this.messageMetadata.uploadMedia({
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

    const originalImageBuffer = Buffer.from(
      message.downloadedMedia.data,
      'base64',
    );

    const pipelineResult =
      await this.imageProductMatchingService.matchIncomingImage({
        imageBuffer: originalImageBuffer,
        messageBody: message?.body,
        context: {
          messageId,
          chatId,
        },
      });

    await this.messageMetadata.upsertMetadata({
      messageId,
      type: 'IMAGE',
      metadata: {
        searchMethod: pipelineResult.searchMethod,
        confidence: pipelineResult.confidence,
        similarity: pipelineResult.similarity,
        ocrText: pipelineResult.ocrText,
        keywords: pipelineResult.keywords,
        matchedKeywords: pipelineResult.matchedKeywords,
        matchedProducts: pipelineResult.matchedProducts,
        geminiDescription: pipelineResult.geminiDescription,
        croppedSuccessfully: pipelineResult.croppedSuccessfully,
        cropMethod: pipelineResult.cropMethod,
        productsFound: pipelineResult.productsFound,
        error: pipelineResult.error,
        mediaUrl: upload.url,
        objectKey: upload.objectKey,
      },
    });

    if (pipelineResult.matchedProducts.length === 0) {
      await this.notifyAdminImageFailure({
        messageId,
        chatId,
        contactId: message?.contactId,
        ocrText: pipelineResult.ocrText,
        geminiDescription: pipelineResult.geminiDescription,
      });
    }

    (message as any).imageProducts = pipelineResult.agentPayload.imageProducts;
    (message as any).imageSearchMethod =
      pipelineResult.agentPayload.imageSearchMethod;
    (message as any).imageOcrText = pipelineResult.agentPayload.imageOcrText;
    (message as any).imageGeminiDescription =
      pipelineResult.agentPayload.imageGeminiDescription;
    (message as any).imageContextBlock =
      pipelineResult.agentPayload.imageContextBlock;
    (message as any).body = pipelineResult.agentPayload.body;

    if (upload.objectKey) {
      try {
        await this.messageMetadata.deleteMedia(upload.objectKey);
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
}
