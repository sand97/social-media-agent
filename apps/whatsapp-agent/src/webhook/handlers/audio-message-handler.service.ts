import { BackendClientService } from '@app/backend-client/backend-client.service';
import { WhatsAppAgentService } from '@app/langchain/whatsapp-agent.service';
import { AudioTranscriptionService } from '@app/media/audio-transcription.service';
import { Injectable, Logger } from '@nestjs/common';

import { stripAndSanitizeWaId } from '../utils/wa-id.utils';

@Injectable()
export class AudioMessageHandlerService {
  private readonly logger = new Logger(AudioMessageHandlerService.name);

  constructor(
    private readonly backendClient: BackendClientService,
    private readonly audioTranscription: AudioTranscriptionService,
    private readonly agentService: WhatsAppAgentService,
  ) {}

  async handleInline(messageData: any[], userId?: string): Promise<void> {
    const [message] = messageData || [];
    const chatId = message?.from || 'unknown';

    if (
      !message?.downloadedMedia?.data ||
      !message?.downloadedMedia?.mimetype
    ) {
      this.logger.warn(
        `Audio inline requested but no media on message ${message?.id?._serialized}`,
      );
      return;
    }

    const upload = await this.backendClient.uploadMedia({
      messageId: message?.id?._serialized || message?.id || 'unknown',
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

    const transcription = await this.audioTranscription.transcribeAudio({
      base64: message.downloadedMedia.data,
      mimeType: message.downloadedMedia.mimetype,
    });

    if (transcription?.transcript) {
      await this.backendClient.upsertMessageMetadata({
        messageId: message?.id?._serialized || message?.id || 'unknown',
        type: 'AUDIO',
        metadata: {
          transcript: transcription.transcript,
          language: transcription.language,
          confidence: transcription.confidence,
          mediaUrl: upload.url,
          objectKey: upload.objectKey,
        },
      });

      (message as any).transcript = transcription.transcript;

      if (upload.objectKey) {
        try {
          await this.backendClient.deleteMedia({ objectKey: upload.objectKey });
        } catch (error: any) {
          this.logger.warn(
            `Unable to delete media ${upload.objectKey}: ${error.message}`,
          );
        }
      }

      (message as any).mediaUrl = upload.url;
      (message as any).mediaKind = 'audio';
    } else {
      this.logger.warn(
        `STT failed or empty transcript for message ${message?.id?._serialized}`,
      );
      return;
    }

    await this.agentService.processIncomingMessage(messageData, userId);
  }
}
