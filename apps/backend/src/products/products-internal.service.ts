import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { ProductsService } from './products.service';
import { ProductImageIndexingUpdateDto } from './dto/batch-update-product-image-indexing.dto';

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

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        retailer_id: product.retailer_id,
        price: product.price,
        category: product.category,
        coverImageDescription: product.coverImageDescription,
        coverImageUrl: coverImage?.url || null,
        coverImageCreatedAt: coverImage?.created_at || null,
        indexDescriptionAt: product.indexDescriptionAt,
        indexImageAt: product.indexImageAt,
        updatedAt: product.updated_at,
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

    const productIds = Array.from(new Set(updates.map((item) => item.productId)));

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

    const now = new Date();
    const updateOperations = normalizedUpdates.flatMap((update) => {
      const patch: {
        coverImageDescription?: string | null;
        indexDescriptionAt?: Date;
        indexImageAt?: Date;
      } = {};

      if (update.coverImageDescription !== undefined) {
        const normalizedDescription = update.coverImageDescription.trim();
        patch.coverImageDescription = normalizedDescription || null;
      }

      if (update.indexDescriptionAt) {
        patch.indexDescriptionAt = new Date(update.indexDescriptionAt);
      }

      if (update.indexImageAt) {
        patch.indexImageAt = new Date(update.indexImageAt);
      }

      if (!update.indexDescriptionAt && update.coverImageDescription !== undefined) {
        patch.indexDescriptionAt = now;
      }

      if (Object.keys(patch).length === 0) {
        return [];
      }

      return [
        this.prisma.product.update({
          where: { id: update.productId },
          data: patch,
          select: { id: true },
        }),
      ];
    });

    if (updateOperations.length > 0) {
      await this.prisma.$transaction(updateOperations);
    }

    return {
      updated: updateOperations.length,
      ignored: updates.length - updateOperations.length,
    };
  }
}
