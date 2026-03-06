import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
} from '@xenova/transformers';

@Injectable()
export class ImageEmbeddingsService implements OnModuleInit {
  private readonly logger = new Logger(ImageEmbeddingsService.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private processor: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private visionModel: any = null;
  private isInitialized = false;

  async onModuleInit() {
    this.logger.log('Initializing CLIP model for image embeddings...');

    // Load model asynchronously so app boot is not blocked.
    this.loadModelAsync();
  }

  private async loadModelAsync() {
    try {
      const modelName = process.env.CLIP_IMAGE_MODEL || 'Xenova/clip-vit-base-patch16';
      this.logger.log(`Loading CLIP model: ${modelName}...`);

      this.processor = await AutoProcessor.from_pretrained(modelName);
      this.visionModel =
        await CLIPVisionModelWithProjection.from_pretrained(modelName);

      this.isInitialized = true;
      this.logger.log('✅ CLIP model loaded successfully');
    } catch (error: any) {
      this.logger.error(`Failed to load CLIP model: ${error.message}`);
      this.logger.warn(
        '⚠️ Image vector search will be DISABLED. OCR search will still work.',
      );
      this.logger.warn(
        'To fix: check internet connection and HuggingFace availability on first download.',
      );
    }
  }

  async generateEmbedding(imageBuffer: Buffer): Promise<number[]> {
    if (!this.isInitialized || !this.processor || !this.visionModel) {
      throw new Error(
        'CLIP model is not initialized. Please wait for the model to load.',
      );
    }

    let tempFilePath: string | null = null;

    try {
      this.logger.debug('Generating image embedding with CLIP...');

      const mimeType = this.detectMimeType(imageBuffer);
      const ext = mimeType.split('/')[1] || 'jpg';
      tempFilePath = path.join(
        os.tmpdir(),
        `clip-${Date.now()}-${Math.random().toString(36).slice(2, 11)}.${ext}`,
      );

      fs.writeFileSync(tempFilePath, imageBuffer);

      const image = await RawImage.read(tempFilePath);
      const imageInputs = await this.processor(image);
      const { image_embeds } = await this.visionModel(imageInputs);
      const embedding = Array.from(image_embeds.data) as number[];

      if (embedding.length === 0) {
        throw new Error('CLIP returned an empty embedding vector');
      }

      this.logger.debug(
        `Generated CLIP image embedding with ${embedding.length} dimensions`,
      );
      return embedding;
    } catch (error: any) {
      this.logger.error(`Failed to generate image embedding: ${error.message}`);
      throw new Error(`Embedding generation failed: ${error.message}`);
    } finally {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch {
          this.logger.warn(`Failed to delete temp file: ${tempFilePath}`);
        }
      }
    }
  }

  isReady(): boolean {
    return (
      this.isInitialized &&
      this.processor !== null &&
      this.visionModel !== null
    );
  }

  private detectMimeType(buffer: Buffer): string {
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }

    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return 'image/png';
    }

    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      return 'image/gif';
    }

    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46
    ) {
      return 'image/webp';
    }

    return 'image/jpeg';
  }
}
