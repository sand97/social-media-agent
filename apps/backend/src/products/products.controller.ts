import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../guards/jwt-auth.guard';

import { AddMetadataDto } from './dto/add-metadata.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { SearchByKeywordsDto } from './dto/search-by-keywords.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all products for current user' })
  @ApiResponse({
    status: 200,
    description: 'List of products retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAllProducts(@Request() req: any) {
    return this.productsService.getAllForUser(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiResponse({
    status: 200,
    description: 'Product retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async getProduct(@Param('id') id: string, @Request() req: any) {
    return this.productsService.getById(id, req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponse({
    status: 201,
    description: 'Product created successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @HttpCode(HttpStatus.CREATED)
  async createProduct(
    @Body() createProductDto: CreateProductDto,
    @Request() req: any,
  ) {
    return this.productsService.create(req.user.id, createProductDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing product' })
  @ApiResponse({
    status: 200,
    description: 'Product updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async updateProduct(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @Request() req: any,
  ) {
    return this.productsService.update(id, req.user.id, updateProductDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a product' })
  @ApiResponse({
    status: 204,
    description: 'Product deleted successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProduct(@Param('id') id: string, @Request() req: any) {
    await this.productsService.delete(id, req.user.id);
  }

  @Post(':id/metadata')
  @ApiOperation({ summary: 'Add metadata to a product' })
  @ApiResponse({
    status: 201,
    description: 'Metadata added successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @HttpCode(HttpStatus.CREATED)
  async addMetadata(
    @Param('id') id: string,
    @Body() addMetadataDto: AddMetadataDto,
    @Request() req: any,
  ) {
    return this.productsService.addMetadata(
      id,
      req.user.id,
      addMetadataDto.key,
      addMetadataDto.value,
      addMetadataDto.isVisible,
    );
  }

  @Post('search-by-keywords')
  @ApiOperation({
    summary: 'Search products by keywords (OCR results)',
    description:
      'Search products by keywords extracted from OCR. Returns matching products and which keywords matched.',
  })
  @ApiResponse({
    status: 200,
    description: 'Products found successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @HttpCode(HttpStatus.OK)
  async searchByKeywords(@Body() searchDto: SearchByKeywordsDto) {
    return this.productsService.searchByKeywords(
      searchDto.user_id,
      searchDto.keywords,
    );
  }
}
