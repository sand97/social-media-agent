import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bull';

import {
  IMAGE_INDEXING_QUEUE_NAME,
  IMAGE_INDEXING_SYNC_JOB,
} from './image-indexing.constants';
import { ProductImageIndexingService } from './product-image-indexing.service';

@Injectable()
export class ImageIndexingProcessor implements OnModuleInit {
  private readonly logger = new Logger(ImageIndexingProcessor.name);

  constructor(
    @InjectQueue(IMAGE_INDEXING_QUEUE_NAME)
    private readonly imageIndexingQueue: Queue,
    private readonly productImageIndexingService: ProductImageIndexingService,
  ) {}

  onModuleInit(): void {
    const handlers = (this.imageIndexingQueue as any).handlers as
      | Record<string, unknown>
      | undefined;

    if (handlers?.[IMAGE_INDEXING_SYNC_JOB]) {
      this.logger.warn(
        `Bull handler "${IMAGE_INDEXING_SYNC_JOB}" already registered, skipping duplicate registration`,
      );
      return;
    }

    this.logger.log(
      `Registering Bull handler "${IMAGE_INDEXING_SYNC_JOB}" on queue "${IMAGE_INDEXING_QUEUE_NAME}"`,
    );

    this.imageIndexingQueue.process(
      IMAGE_INDEXING_SYNC_JOB,
      async (job: Job) => {
        await this.handleCatalogImageSync(job);
      },
    );
  }

  private async handleCatalogImageSync(job: Job): Promise<void> {
    this.logger.log(
      '🚀 Starting catalog indexing (images + text embeddings to Qdrant)',
    );

    const result =
      await this.productImageIndexingService.syncCatalogProducts(job);

    if (!result.success) {
      throw new Error(result.message);
    }

    this.logger.log('✅ Catalog indexing completed successfully');
  }
}
