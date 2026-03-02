import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ProductSendService } from './product-send.service';

@ApiTags('Communication')
@Controller('tools/communication')
export class CommunicationTestController {
  constructor(private readonly productSendService: ProductSendService) {}

  @Post('send-products/test')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Test product ID resolution before sending products',
    description:
      'Resolve internal/retailer/WhatsApp product IDs to WhatsApp product IDs. Use dryRun=true to test without sending.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        chatId: {
          type: 'string',
          example: '64845667926032@lid',
          nullable: true,
        },
        productIds: {
          type: 'array',
          items: { type: 'string' },
          example: ['cmm6aiemj003ys02rifs8isp2', 'barcelone-domicile'],
        },
        dryRun: { type: 'boolean', default: true },
      },
      required: ['productIds'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Resolution result (and optional send result)',
  })
  async testSendProducts(
    @Body()
    body: {
      chatId?: string;
      productIds?: string[];
      dryRun?: boolean;
    },
  ) {
    const productIds = Array.isArray(body.productIds) ? body.productIds : [];
    if (productIds.length === 0) {
      throw new BadRequestException('productIds is required');
    }

    const dryRun = body.dryRun !== false;
    const resolution =
      await this.productSendService.resolveProductIdsForWhatsApp(productIds);

    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        resolvedIds: resolution.resolvedIds,
        mappings: resolution.mappings,
      };
    }

    const chatId = (body.chatId || '').trim();
    if (!chatId) {
      throw new BadRequestException('chatId is required when dryRun is false');
    }

    const sendResult = await this.productSendService.sendProducts(
      chatId,
      productIds,
    );

    return {
      success: true,
      dryRun: false,
      chatId,
      resolvedIds: resolution.resolvedIds,
      mappings: resolution.mappings,
      sendResult,
    };
  }
}
