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

  async searchProductsByKeywords(
    userId: string,
    keywords: string[],
    retailerId?: string,
  ) {
    return this.productsService.searchByKeywords(userId, keywords, retailerId);
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
