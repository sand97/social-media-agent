import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  ImageProductMatchingResult,
  ImageProductMatchingService,
} from './image-product-matching.service';

@ApiTags('image-processing-test')
@Controller('test')
export class ImageProcessingController {
  constructor(
    private readonly imageProductMatchingService: ImageProductMatchingService,
  ) {}

  @Post('image-pipeline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Exécuter le pipeline complet d'identification produit depuis image",
    description:
      "Endpoint de test unique. Il exécute exactement le même pipeline que le handler WhatsApp image (OCR -> retailer_id -> qdrant_image -> qdrant_text).",
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Image à analyser',
        },
      },
      required: ['image'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Résultat détaillé du pipeline image',
  })
  @UseInterceptors(FileInterceptor('image'))
  async runImagePipeline(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImageProductMatchingResult> {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }

    return this.imageProductMatchingService.matchIncomingImage({
      imageBuffer: file.buffer,
      messageBody: '[Image envoyée par le contact]',
    });
  }
}
