import { Prisma } from '@app/generated/client';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { ProductImageIndexingUpdateDto } from './dto/batch-update-product-image-indexing.dto';
import { ProductsService } from './products.service';

@Injectable()
export class ProductsInternalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
  ) {}

  async getSampleProducts(
    userId: string,
    maxProducts = 20,
    maxPerCollection = 3,
  ) {
    const sampleProducts: unknown[] = [];
    const seenProductIds = new Set<string>();

    const collections = await this.prisma.collection.findMany({
      where: { user_id: userId },
      select: { id: true },
      orderBy: { created_at: 'desc' },
    });

    for (const collection of collections) {
      if (sampleProducts.length >= maxProducts) {
        break;
      }

      const products = await this.prisma.product.findMany({
        where: {
          user_id: userId,
          collection_id: collection.id,
        },
        include: {
          images: {
            orderBy: { image_index: 'asc' },
          },
          metadata: true,
          collection: true,
        },
        orderBy: { created_at: 'desc' },
        take: maxPerCollection,
      });

      for (const product of products) {
        if (sampleProducts.length >= maxProducts) {
          break;
        }

        if (seenProductIds.has(product.id)) {
          continue;
        }

        sampleProducts.push(product);
        seenProductIds.add(product.id);
      }
    }

    if (sampleProducts.length < maxProducts) {
      const uncategorized = await this.prisma.product.findMany({
        where: {
          user_id: userId,
          collection_id: null,
        },
        include: {
          images: {
            orderBy: { image_index: 'asc' },
          },
          metadata: true,
          collection: true,
        },
        orderBy: { created_at: 'desc' },
        take: maxProducts - sampleProducts.length,
      });

      for (const product of uncategorized) {
        if (sampleProducts.length >= maxProducts) {
          break;
        }

        if (seenProductIds.has(product.id)) {
          continue;
        }

        sampleProducts.push(product);
        seenProductIds.add(product.id);
      }
    }

    if (sampleProducts.length < maxProducts) {
      const remaining = await this.prisma.product.findMany({
        where: {
          user_id: userId,
          id: {
            notIn: Array.from(seenProductIds),
          },
        },
        include: {
          images: {
            orderBy: { image_index: 'asc' },
          },
          metadata: true,
          collection: true,
        },
        orderBy: { created_at: 'desc' },
        take: maxProducts - sampleProducts.length,
      });

      sampleProducts.push(...remaining);
    }

    return sampleProducts;
  }

  async getProductByRetailerId(userId: string, retailerId: string) {
    return this.prisma.product.findFirst({
      where: {
        user_id: userId,
        retailer_id: {
          equals: retailerId,
          mode: 'insensitive',
        },
      },
      include: {
        images: {
          orderBy: { image_index: 'asc' },
        },
        metadata: true,
        collection: true,
      },
    });
  }

  async getProductByAnyId(userId: string, productId: string) {
    return this.prisma.product.findFirst({
      where: {
        user_id: userId,
        OR: [
          { id: productId },
          { whatsapp_product_id: productId },
          {
            retailer_id: {
              equals: productId,
              mode: 'insensitive',
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        retailer_id: true,
        whatsapp_product_id: true,
      },
    });
  }

  async getProductsByAnyIds(userId: string, ids: string[]) {
    const normalizedIds = Array.from(
      new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean)),
    );

    if (normalizedIds.length === 0) {
      return [];
    }

    const products = await this.prisma.product.findMany({
      where: {
        user_id: userId,
        OR: [
          { id: { in: normalizedIds } },
          { whatsapp_product_id: { in: normalizedIds } },
          ...normalizedIds.map((id) => ({
            retailer_id: {
              equals: id,
              mode: 'insensitive' as const,
            },
          })),
        ],
      },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        currency: true,
        retailer_id: true,
        whatsapp_product_id: true,
        url: true,
        images: {
          orderBy: { image_index: 'asc' },
          take: 1,
          select: {
            url: true,
          },
        },
      },
    });

    const byProductId = new Map(
      products.map((product) => [product.id, product]),
    );
    const byWhatsappProductId = new Map(
      products
        .filter((product) => product.whatsapp_product_id)
        .map((product) => [String(product.whatsapp_product_id), product]),
    );
    const byRetailerIdLower = new Map(
      products
        .filter((product) => product.retailer_id)
        .map((product) => [String(product.retailer_id).toLowerCase(), product]),
    );

    return normalizedIds.map((inputId) => {
      const byId = byProductId.get(inputId);
      const byWhatsApp = byWhatsappProductId.get(inputId);
      const byRetailer = byRetailerIdLower.get(inputId.toLowerCase());
      const product = byId || byWhatsApp || byRetailer || null;

      const matchedBy = byId
        ? 'id'
        : byWhatsApp
          ? 'whatsapp_product_id'
          : byRetailer
            ? 'retailer_id'
            : null;

      return {
        inputId,
        matchedBy,
        product: product
          ? {
              id: product.id,
              name: product.name,
              description: product.description,
              price: product.price,
              currency: product.currency,
              retailer_id: product.retailer_id,
              whatsapp_product_id: product.whatsapp_product_id,
              url: product.url,
              coverImageUrl: product.images?.[0]?.url || null,
            }
          : null,
      };
    });
  }

  async searchProductsByKeywords(
    userId: string,
    keywords: string[],
  ) {
    return this.productsService.searchByKeywords(userId, keywords);
  }

  async getProductsForImageIndexing(userId: string) {
    const products = await this.prisma.product.findMany({
      where: { user_id: userId },
      include: {
        images: {
          orderBy: { image_index: 'asc' },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return products.map((product) => {
      const coverImage =
        product.images.find((image) => image.image_index === 0) ||
        product.images[0] ||
        null;

      const images = product.images.map((image) => ({
        id: image.id,
        url: image.url,
        imageIndex: image.image_index,
        needsImageIndexing: image.needsImageIndexing,
        whatsappImageHash: image.whatsapp_image_hash,
        createdAt: image.created_at,
      }));

      const latestImageCreatedAt =
        product.images.length > 0
          ? product.images.reduce(
              (latest, current) =>
                current.created_at > latest ? current.created_at : latest,
              product.images[0].created_at,
            )
          : null;

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        retailer_id: product.retailer_id,
        price: product.price,
        category: product.category,
        images,
        coverImageDescription: product.coverImageDescription,
        coverImageUrl: coverImage?.url || null,
        coverImageCreatedAt:
          latestImageCreatedAt || coverImage?.created_at || null,
        needsTextIndexing: product.needsTextIndexing,
      };
    });
  }

  async batchUpdateImageIndexing(
    userId: string,
    updates: ProductImageIndexingUpdateDto[],
  ) {
    if (!updates.length) {
      return {
        updated: 0,
        ignored: 0,
      };
    }

    const productIds = Array.from(
      new Set(updates.map((item) => item.productId)),
    );

    const ownedProducts = await this.prisma.product.findMany({
      where: {
        user_id: userId,
        id: {
          in: productIds,
        },
      },
      select: { id: true },
    });

    const ownedProductIds = new Set(ownedProducts.map((product) => product.id));

    const normalizedUpdates = updates.filter((update) =>
      ownedProductIds.has(update.productId),
    );

    if (!normalizedUpdates.length) {
      return {
        updated: 0,
        ignored: updates.length,
      };
    }

    let appliedUpdates = 0;
    const updateOperations = normalizedUpdates.flatMap((update) => {
      const rawCoverDescription = update.coverImageDescription;
      const hasCoverDescription = typeof rawCoverDescription === 'string';
      const coverDescription = hasCoverDescription
        ? rawCoverDescription.trim() || null
        : undefined;
      const textIndexed = update.textIndexed === true;
      const indexedImageIds = Array.isArray(update.indexedImageIds)
        ? Array.from(new Set(update.indexedImageIds.filter(Boolean)))
        : [];

      if (
        !hasCoverDescription &&
        !textIndexed &&
        indexedImageIds.length === 0
      ) {
        return [];
      }

      const data: {
        coverImageDescription?: string | null;
        needsTextIndexing?: boolean;
      } = {};

      if (hasCoverDescription) {
        data.coverImageDescription = coverDescription;
      }

      if (textIndexed) {
        data.needsTextIndexing = false;
      }

      const operations: Prisma.PrismaPromise<Prisma.BatchPayload>[] = [];

      if (Object.keys(data).length > 0) {
        operations.push(
          this.prisma.product.updateMany({
            where: {
              id: update.productId,
              user_id: userId,
            },
            data,
          }),
        );
      }

      if (indexedImageIds.length > 0) {
        operations.push(
          this.prisma.productImage.updateMany({
            where: {
              product_id: update.productId,
              id: { in: indexedImageIds },
            },
            data: {
              needsImageIndexing: false,
            },
          }),
        );
      }

      if (operations.length > 0) {
        appliedUpdates += 1;
      }

      return operations;
    });

    if (updateOperations.length > 0) {
      await this.prisma.$transaction(updateOperations);
    }

    return {
      updated: appliedUpdates,
      ignored: updates.length - appliedUpdates,
    };
  }
}
