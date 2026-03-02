import { BackendClientService } from '@app/backend-client/backend-client.service';
import { InternalProductByAnyIdsMatch } from '@app/backend-client/backend-api.types';
import { ConnectorClientService } from '@app/connector/connector-client.service';
import { PageScriptService } from '@app/page-scripts/page-script.service';
import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

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

export interface ProductLinkPreviewOverride {
  title?: string;
  description?: string;
  thumbnail?: string;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
}

@Injectable()
export class ProductSendService {
  private readonly logger = new Logger(ProductSendService.name);
  private readonly maxConcurrentConversations = 3;
  private readonly previewThumbnailSize = 600;
  private readonly previewMaxDescriptionChars = 110;
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

    const productLinkOverrides =
      await this.buildProductLinkPreviewOverridesByResolvedId(resolution);

    return this.enqueueConversationTask(to, async () => {
      const script = this.scriptService.getScript('chat/sendProductsMessage', {
        TO: to,
        PRODUCT_IDS: resolution.resolvedIds.map((id) => String(id)).join(','),
        PRODUCT_LINK_OVERRIDES: JSON.stringify(productLinkOverrides),
      });

      const sendResult = await this.connectorClient.executeScript(script);
      return {
        ...(sendResult && typeof sendResult === 'object'
          ? sendResult
          : { rawResult: sendResult }),
        resolvedProductIds: resolution.resolvedIds,
        resolution: resolution.mappings,
        productLinkOverrides,
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

  private async buildProductLinkPreviewOverridesByResolvedId(
    resolution: ProductIdResolutionResult,
  ): Promise<Record<string, ProductLinkPreviewOverride>> {
    try {
      const products =
        await this.backendClient.getProductsByAnyIds(resolution.resolvedIds);
      const byInputId = new Map(products.map((entry) => [entry.inputId, entry]));
      const overridesByResolvedId: Record<string, ProductLinkPreviewOverride> =
        {};

      for (const resolvedId of resolution.resolvedIds) {
        const product = byInputId.get(resolvedId)?.product ?? null;
        if (!product) {
          continue;
        }

        const previewOverride =
          await this.buildProductLinkPreviewOverride(product);
        if (!previewOverride) {
          continue;
        }

        overridesByResolvedId[resolvedId] = previewOverride;
      }

      return overridesByResolvedId;
    } catch (error: any) {
      this.logger.warn(
        `[PRODUCT_SEND] Failed to build product preview overrides: ${error?.message || error}`,
      );
      return {};
    }
  }

  private async buildProductLinkPreviewOverride(
    product: InternalProductByAnyIdsMatch,
  ): Promise<ProductLinkPreviewOverride | null> {
    const baseTitle = String(product.name || '').trim() || null;
    const shortDescription = this.truncateToTwoSentences(product.description);
    const formattedPrice = this.formatCatalogPrice(product.price, product.currency);
    const title = this.composePreviewTitle(baseTitle, formattedPrice);
    const description = this.truncatePreviewText(shortDescription);
    const thumbnailData = await this.buildPreviewThumbnail(product.coverImageUrl);

    if (!title && !description && !thumbnailData) {
      return null;
    }

    return {
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(thumbnailData || {}),
    };
  }

  private truncateToTwoSentences(
    description: string | null | undefined,
  ): string | null {
    const normalized = String(description || '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalized) {
      return null;
    }

    const sentences = normalized
      .match(/[^.!?\n]+[.!?]?/g)
      ?.map((segment) => segment.trim())
      .filter(Boolean);

    if (!sentences || sentences.length === 0) {
      return normalized;
    }

    return sentences.slice(0, 2).join(' ');
  }

  private formatCatalogPrice(
    rawPrice?: number | string | null,
    rawCurrency?: string | null,
  ): string | null {
    if (rawPrice === null || rawPrice === undefined) {
      return null;
    }

    if (!rawCurrency) {
      return null;
    }

    const currencyLabel = rawCurrency.trim();
    if (!currencyLabel) {
      return null;
    }

    const numericPrice = Number(rawPrice);
    if (!Number.isFinite(numericPrice)) {
      return null;
    }

    const currencyUpper = currencyLabel.toUpperCase();
    const currencyForIntl = currencyUpper === 'FCFA' ? 'XAF' : currencyUpper;

    try {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: currencyForIntl,
      }).format(numericPrice);
    } catch {
      const formatted = new Intl.NumberFormat('fr-FR', {
        maximumFractionDigits: 2,
      }).format(numericPrice);
      return `${formatted} ${currencyUpper}`;
    }
  }

  private composePreviewTitle(
    title: string | null,
    formattedPrice: string | null,
  ): string | null {
    const normalizedTitle = String(title || '').replace(/\s+/g, ' ').trim();
    const normalizedPrice = String(formattedPrice || '').trim();

    if (!normalizedTitle && !normalizedPrice) {
      return null;
    }

    if (normalizedTitle && normalizedPrice) {
      return `${normalizedTitle} • ${normalizedPrice}`;
    }

    return normalizedTitle || normalizedPrice;
  }

  private truncatePreviewText(
    text: string | null,
    maxChars = this.previewMaxDescriptionChars,
  ): string | null {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return null;
    }

    if (normalized.length <= maxChars) {
      return normalized;
    }

    const hardCut = normalized.slice(0, Math.max(0, maxChars - 3));
    const wordSafeCut = hardCut.replace(/\s+\S*$/, '').trim();
    const cut = wordSafeCut || hardCut.trim();

    return `${cut}...`;
  }

  private async buildPreviewThumbnail(
    imageUrl?: string | null,
  ): Promise<
    Pick<
      ProductLinkPreviewOverride,
      'thumbnail' | 'thumbnailWidth' | 'thumbnailHeight'
    > | null
  > {
    const normalizedUrl = String(imageUrl || '').trim();
    if (!normalizedUrl) {
      return null;
    }

    try {
      const response = await fetch(normalizedUrl, { redirect: 'follow' });
      if (!response.ok) {
        return null;
      }

      const contentType = String(response.headers.get('content-type') || '');
      if (!contentType.toLowerCase().startsWith('image/')) {
        return null;
      }

      const input = Buffer.from(await response.arrayBuffer());
      if (!input.length) {
        return null;
      }

      const thumbnailBuffer = await sharp(input)
        .resize(this.previewThumbnailSize, this.previewThumbnailSize, {
          fit: 'cover',
          position: 'centre',
          withoutEnlargement: false,
        })
        .jpeg({ quality: 84 })
        .toBuffer();

      if (!thumbnailBuffer.length) {
        return null;
      }

      return {
        thumbnail: thumbnailBuffer.toString('base64'),
        thumbnailWidth: this.previewThumbnailSize,
        thumbnailHeight: this.previewThumbnailSize,
      };
    } catch (error: any) {
      this.logger.warn(
        `[PRODUCT_SEND] Failed to build thumbnail for "${normalizedUrl}": ${error?.message || error}`,
      );
      return null;
    }
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
