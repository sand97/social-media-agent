import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product, ProductMetadata } from '@app/generated/client';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all products for a user with metadata
   */
  async getAllForUser(userId: string) {
    return this.prisma.product.findMany({
      where: { userId },
      include: {
        metadata: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get product by ID with ownership check
   */
  async getById(productId: string, userId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        metadata: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this product',
      );
    }

    return product;
  }

  /**
   * Create a new product
   */
  async create(userId: string, data: CreateProductDto): Promise<Product> {
    if (!data.name || data.name.trim() === '') {
      throw new BadRequestException('Product name is required');
    }

    return this.prisma.product.create({
      data: {
        userId,
        name: data.name,
        description: data.description || null,
        price: data.price || null,
        currency: data.currency || 'XAF',
        category: data.category || null,
        images: data.images || [],
      },
      include: {
        metadata: true,
      },
    });
  }

  /**
   * Update an existing product
   */
  async update(
    productId: string,
    userId: string,
    data: UpdateProductDto,
  ): Promise<Product> {
    // Verify ownership
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this product',
      );
    }

    // Build update data (only include provided fields)
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.images !== undefined) updateData.images = data.images;

    return this.prisma.product.update({
      where: { id: productId },
      data: updateData,
      include: {
        metadata: true,
      },
    });
  }

  /**
   * Delete a product
   */
  async delete(productId: string, userId: string): Promise<void> {
    // Verify ownership
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this product',
      );
    }

    await this.prisma.product.delete({
      where: { id: productId },
    });
  }

  /**
   * Add metadata to a product
   */
  async addMetadata(
    productId: string,
    userId: string,
    key: string,
    value: string,
    isVisible: boolean,
  ): Promise<ProductMetadata> {
    // Verify product ownership
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to add metadata to this product',
      );
    }

    if (!key || key.trim() === '' || !value || value.trim() === '') {
      throw new BadRequestException('Key and value are required');
    }

    return this.prisma.productMetadata.create({
      data: {
        productId,
        key: key.trim(),
        value: value.trim(),
        isVisible,
      },
    });
  }

  /**
   * Update AI suggestions for a product
   */
  async updateAiSuggestions(
    productId: string,
    userId: string,
    suggestions: any,
  ): Promise<Product> {
    // Verify product ownership
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update suggestions for this product',
      );
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: {
        aiSuggestions: suggestions || {},
      },
      include: {
        metadata: true,
      },
    });
  }

  /**
   * Delete product metadata
   */
  async deleteMetadata(
    metadataId: string,
    userId: string,
  ): Promise<void> {
    // Get metadata with product info
    const metadata = await this.prisma.productMetadata.findUnique({
      where: { id: metadataId },
      include: {
        product: true,
      },
    });

    if (!metadata) {
      throw new NotFoundException('Metadata not found');
    }

    if (metadata.product.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this metadata',
      );
    }

    await this.prisma.productMetadata.delete({
      where: { id: metadataId },
    });
  }
}
