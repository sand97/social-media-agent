import { BackendClientService } from '@app/backend-client/backend-client.service';
import { ConnectorClientService } from '@app/connector/connector-client.service';
import { PageScriptService } from '@app/page-scripts/page-script.service';
import { Injectable, Logger } from '@nestjs/common';

export interface ProductIdResolution {
  inputId: string;
  resolvedId: string;
  source:
    | 'passthrough'
    | 'backend_whatsapp_product_id'
    | 'backend_no_whatsapp_id';
  backendProductId?: string;
  backendRetailerId?: string | null;
  backendWhatsAppProductId?: string | null;
}

export interface ProductIdResolutionResult {
  resolvedIds: string[];
  mappings: ProductIdResolution[];
}

@Injectable()
export class ProductSendService {
  private readonly logger = new Logger(ProductSendService.name);
  private readonly maxConcurrentConversations = 3;
  private activeConversations = 0;
  private waitQueue: Array<() => void> = [];
  private conversationChains = new Map<string, Promise<unknown>>();

  constructor(
    private readonly backendClient: BackendClientService,
    private readonly connectorClient: ConnectorClientService,
    private readonly scriptService: PageScriptService,
  ) {}

  async sendProduct(to: string, productId: string): Promise<any> {
    return this.sendProducts(to, [productId]);
  }

  async sendProducts(to: string, productIds: string[]): Promise<any> {
    if (!to) {
      throw new Error('TO is required');
    }

    if (!productIds || productIds.length === 0) {
      throw new Error('PRODUCT_IDS is required');
    }

    const resolution = await this.resolveProductIdsForWhatsApp(productIds);
    if (resolution.resolvedIds.length === 0) {
      throw new Error('No valid product IDs after resolution');
    }

    this.logger.debug(
      `[PRODUCT_SEND] Resolved product IDs: ${JSON.stringify(
        resolution.mappings,
      )}`,
    );

    return this.enqueueConversationTask(to, async () => {
      const script = this.scriptService.getScript('chat/sendProductsMessage', {
        TO: to,
        PRODUCT_IDS: resolution.resolvedIds.map((id) => String(id)).join(','),
      });

      const sendResult = await this.connectorClient.executeScript(script);
      return {
        ...(sendResult && typeof sendResult === 'object'
          ? sendResult
          : { rawResult: sendResult }),
        resolvedProductIds: resolution.resolvedIds,
        resolution: resolution.mappings,
      };
    });
  }

  async resolveProductIdsForWhatsApp(
    productIds: string[],
  ): Promise<ProductIdResolutionResult> {
    const mappings: ProductIdResolution[] = [];
    const resolvedIds: string[] = [];
    const seenResolved = new Set<string>();

    for (const rawId of productIds || []) {
      const inputId = String(rawId || '').trim();
      if (!inputId) {
        continue;
      }

      let resolvedId = inputId;
      let source: ProductIdResolution['source'] = 'passthrough';
      let backendProductId: string | undefined;
      let backendRetailerId: string | null | undefined;
      let backendWhatsAppProductId: string | null | undefined;

      try {
        const backendProduct =
          await this.backendClient.getProductByAnyId(inputId);
        if (backendProduct) {
          backendProductId = backendProduct.id;
          backendRetailerId = backendProduct.retailer_id ?? null;
          backendWhatsAppProductId = backendProduct.whatsapp_product_id ?? null;

          if (backendProduct.whatsapp_product_id?.trim()) {
            resolvedId = backendProduct.whatsapp_product_id.trim();
            source = 'backend_whatsapp_product_id';
          } else {
            source = 'backend_no_whatsapp_id';
          }
        }
      } catch (error: any) {
        this.logger.warn(
          `[PRODUCT_SEND] Failed to resolve productId "${inputId}" via backend: ${error?.message || error}`,
        );
      }

      mappings.push({
        inputId,
        resolvedId,
        source,
        backendProductId,
        backendRetailerId,
        backendWhatsAppProductId,
      });

      if (!seenResolved.has(resolvedId)) {
        seenResolved.add(resolvedId);
        resolvedIds.push(resolvedId);
      }
    }

    return {
      resolvedIds,
      mappings,
    };
  }

  async sendCollection(to: string, collectionId: string): Promise<any> {
    if (!to) {
      throw new Error('TO is required');
    }

    if (!collectionId) {
      throw new Error('COLLECTION_ID is required');
    }

    return this.enqueueConversationTask(to, async () => {
      const script = this.scriptService.getScript(
        'communication/sendCollection',
        {
          TO: to,
          COLLECTION_ID: collectionId,
        },
      );

      return this.connectorClient.executeScript(script);
    });
  }

  private enqueueConversationTask<T>(
    chatId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const previous = this.conversationChains.get(chatId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => this.withGlobalLimit(chatId, task));

    this.conversationChains.set(chatId, next);

    return next.finally(() => {
      if (this.conversationChains.get(chatId) === next) {
        this.conversationChains.delete(chatId);
      }
    });
  }

  private async withGlobalLimit<T>(
    chatId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    await this.acquireSlot(chatId);
    try {
      return await task();
    } finally {
      this.releaseSlot(chatId);
    }
  }

  private async acquireSlot(chatId: string): Promise<void> {
    if (this.activeConversations < this.maxConcurrentConversations) {
      this.activeConversations += 1;
      this.logger.debug(
        `[PRODUCT_SEND] Slot acquired for ${chatId}. Active: ${this.activeConversations}/${this.maxConcurrentConversations}`,
      );
      return;
    }

    this.logger.debug(
      `[PRODUCT_SEND] Waiting for slot for ${chatId}. Active: ${this.activeConversations}/${this.maxConcurrentConversations}`,
    );

    await new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });

    this.logger.debug(
      `[PRODUCT_SEND] Slot acquired after wait for ${chatId}. Active: ${this.activeConversations}/${this.maxConcurrentConversations}`,
    );
  }

  private releaseSlot(chatId: string): void {
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      if (next) {
        next();
      }
      return;
    }

    this.activeConversations = Math.max(0, this.activeConversations - 1);
    this.logger.debug(
      `[PRODUCT_SEND] Slot released for ${chatId}. Active: ${this.activeConversations}/${this.maxConcurrentConversations}`,
    );
  }
}
