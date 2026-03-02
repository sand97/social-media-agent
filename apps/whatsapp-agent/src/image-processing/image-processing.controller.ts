import * as fs from 'fs';
import * as path from 'path';

import { BackendClientService } from '@app/backend-client/backend-client.service';
import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  Body,
  BadRequestException,
  Get,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import sharp from 'sharp';

import { ImageEmbeddingsService } from './image-embeddings.service';
import { OcrService } from './ocr.service';
import { QdrantService } from './qdrant.service';
import { SmartCropService } from './smart-crop.service';

@ApiTags('image-processing-test')
@Controller('test')
export class ImageProcessingController {
  constructor(
    private readonly ocrService: OcrService,
    private readonly backendClient: BackendClientService,
    private readonly qdrantService: QdrantService,
    private readonly imageEmbeddings: ImageEmbeddingsService,
    private readonly smartCropService: SmartCropService,
  ) {}

  @Post('ocr-extract')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Extract text from image using OCR',
    description: 'Upload an image and extract text using Tesseract OCR',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Image file to extract text from',
        },
      },
      required: ['image'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Text extracted successfully',
    schema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        keywords: { type: 'array', items: { type: 'string' } },
        charactersCount: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - No image provided' })
  @UseInterceptors(FileInterceptor('image'))
  async extractOcr(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ text: string; keywords: string[]; charactersCount: number }> {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }

    const text = await this.ocrService.extractText(file.buffer);
    const keywords = this.extractWords(text);

    return {
      text,
      keywords,
      charactersCount: text.length,
    };
  }

  @Post('ocr-search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'OCR + Search products in backend',
    description:
      'Upload an image, extract text via OCR, search for matching products in backend',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Image file to extract text and search products',
        },
        user_id: {
          type: 'string',
          description: 'User ID (required)',
        },
        retailer_id: {
          type: 'string',
          description: 'Retailer ID (optional)',
        },
      },
      required: ['image', 'user_id'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Search completed successfully',
    schema: {
      type: 'object',
      properties: {
        ocrText: { type: 'string' },
        keywords: { type: 'array', items: { type: 'string' } },
        productsFound: { type: 'number' },
        matchedKeywords: { type: 'array', items: { type: 'string' } },
        products: { type: 'array' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @UseInterceptors(FileInterceptor('image'))
  async ocrAndSearch(
    @UploadedFile() file: Express.Multer.File,
    @Body('user_id') userId: string,
    @Body('retailer_id') retailerId?: string,
  ): Promise<{
    ocrText: string;
    keywords: string[];
    productsFound: number;
    matchedKeywords: string[];
    products: unknown[];
  }> {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }

    if (!userId) {
      throw new BadRequestException('user_id is required');
    }

    // Step 1: Extract text from image
    const ocrText = await this.ocrService.extractText(file.buffer);
    const keywords = this.extractWords(ocrText);

    // Step 2: Search products in backend
    const backendUrl = process.env.BACKEND_BASE_URL || 'http://localhost:3000';
    const searchUrl = `${backendUrl}/products/search-by-keywords`;

    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        keywords,
        user_id: userId,
        retailer_id: retailerId,
      }),
    });

    if (!response.ok) {
      throw new BadRequestException(
        `Backend search failed: ${response.statusText}`,
      );
    }

    const searchResult = (await response.json()) as {
      products: unknown[];
      matchedKeywords: string[];
    };

    return {
      ocrText,
      keywords,
      productsFound: searchResult.products.length,
      matchedKeywords: searchResult.matchedKeywords,
      products: searchResult.products,
    };
  }

  @Post('qdrant/create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create Qdrant collection',
    description: 'Create a Qdrant collection for storing image embeddings',
  })
  @ApiResponse({
    status: 200,
    description: 'Collection created successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        collectionName: { type: 'string' },
        vectorSize: { type: 'number' },
      },
    },
  })
  async createQdrantCollection(
    @Body('collection_name') collectionName?: string,
    @Body('vector_size') vectorSize?: number,
  ): Promise<{
    success: boolean;
    collectionName: string;
    vectorSize: number;
  }> {
    const size = vectorSize || 3072; // Gemini image embedding default
    const name =
      collectionName || process.env.QDRANT_COLLECTION_NAME || 'product-images';

    await this.qdrantService.createCollection(name, size);

    return {
      success: true,
      collectionName: name,
      vectorSize: size,
    };
  }

  @Get('qdrant/info')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get Qdrant collection info',
    description: 'Get information about the Qdrant collection',
  })
  @ApiResponse({
    status: 200,
    description: 'Collection info retrieved successfully',
  })
  async getQdrantInfo() {
    return this.qdrantService.getCollectionInfo();
  }

  @Get('status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check image processing services status',
    description:
      'Check if OCR, Gemini image embeddings, and Qdrant services are available',
  })
  @ApiResponse({
    status: 200,
    description: 'Status retrieved successfully',
  })
  async getStatus() {
    return {
      ocr: {
        available: true,
        service: 'Tesseract.js',
        languages: ['fra', 'eng'],
      },
      clip: {
        available: this.imageEmbeddings.isReady(),
        service: 'Gemini image embeddings',
        status: this.imageEmbeddings.isReady()
          ? 'Ready (Gemini Vision + text embeddings)'
          : 'Unavailable (check GEMINI_API_KEY)',
      },
      qdrant: {
        available: this.qdrantService.isConfigured(),
        service: 'Qdrant Vector Database',
        status: this.qdrantService.isConfigured()
          ? 'Configured'
          : 'Not configured (missing QDRANT_API_URL or QDRANT_API_KEY)',
      },
      recommendation: !this.imageEmbeddings.isReady()
        ? 'Gemini image embeddings unavailable. Configure GEMINI_API_KEY.'
        : 'All services operational',
    };
  }

  @Post('qdrant/index')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Index test-images folder in Qdrant',
    description:
      'Generate image embeddings for all images in test-images folder and index them in Qdrant',
  })
  @ApiResponse({
    status: 200,
    description: 'Images indexed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        imagesIndexed: { type: 'number' },
        images: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  async indexTestImages(): Promise<{
    success: boolean;
    imagesIndexed: number;
    images: string[];
  }> {
    if (!this.imageEmbeddings.isReady()) {
      throw new BadRequestException(
        '❌ Gemini image embeddings are unavailable (check GEMINI_API_KEY).',
      );
    }

    // Path to test-images folder
    const testImagesPath = path.join(process.cwd(), 'test-images');

    if (!fs.existsSync(testImagesPath)) {
      throw new BadRequestException(
        `test-images folder not found at ${testImagesPath}`,
      );
    }

    // Read all image files
    const files = fs
      .readdirSync(testImagesPath)
      .filter((file) => /\.(jpg|jpeg|png|webp|gif)$/i.test(file));

    if (files.length === 0) {
      throw new BadRequestException('No image files found in test-images/');
    }

    const indexedImages: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = path.join(testImagesPath, file);
      const imageBuffer = fs.readFileSync(filePath);

      // Generate embedding
      const embedding =
        await this.imageEmbeddings.generateEmbedding(imageBuffer);

      // Use index as product ID (Qdrant requires unsigned integer or UUID)
      const productId = i;

      // Index in Qdrant with metadata containing the actual filename
      await this.qdrantService.indexImage(productId, embedding, {
        filename: file,
        productName: path.parse(file).name,
        filepath: filePath,
      });

      indexedImages.push(file);
    }

    return {
      success: true,
      imagesIndexed: indexedImages.length,
      images: indexedImages,
    };
  }

  @Post('qdrant/search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Search similar images in Qdrant',
    description:
      'Upload an image and find similar products using image embeddings',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Image file to search for similar products',
        },
        limit: {
          type: 'string',
          description: 'Maximum number of results (default: 5)',
          example: '5',
        },
        threshold: {
          type: 'string',
          description: 'Minimum similarity score 0-1 (default: 0.7)',
          example: '0.7',
        },
      },
      required: ['image'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Similar images found successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        resultsFound: { type: 'number' },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'string' },
              score: { type: 'number' },
              metadata: { type: 'object' },
            },
          },
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('image'))
  async searchSimilarImages(
    @UploadedFile() file: Express.Multer.File,
    @Body('limit') limit?: string,
    @Body('threshold') threshold?: string,
  ): Promise<{
    success: boolean;
    resultsFound: number;
    results: Array<{
      productId: string;
      score: number;
      metadata: Record<string, unknown>;
    }>;
  }> {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }

    if (!this.imageEmbeddings.isReady()) {
      throw new BadRequestException(
        '❌ Gemini image embeddings are unavailable (check GEMINI_API_KEY).',
      );
    }

    // Generate embedding for query image
    const embedding = await this.imageEmbeddings.generateEmbedding(file.buffer);

    // Search in Qdrant
    const searchLimit = limit ? parseInt(limit, 10) : 5;
    const scoreThreshold = threshold ? parseFloat(threshold) : 0.7;

    const results = await this.qdrantService.searchSimilarImages(
      embedding,
      searchLimit,
      scoreThreshold,
    );

    return {
      success: true,
      resultsFound: results.length,
      results,
    };
  }

  @Post('smart-crop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Layout crop image to extract post image',
    description:
      'Detect and crop the main post image using layout analysis (PaddleOCR PP-Structure). ' +
      'Useful for extracting product images from social media screenshots (Facebook, TikTok, Instagram, etc.)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Screenshot or image to smart crop',
        },
        width: {
          type: 'string',
          description: 'Target width for cropped image (default: 800)',
          example: '800',
        },
        height: {
          type: 'string',
          description: 'Target height for cropped image (default: 800)',
          example: '800',
        },
        save: {
          type: 'string',
          description: 'Save cropped image to disk (true/false, default: true)',
          example: 'true',
        },
      },
      required: ['image'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Image cropped successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        croppedPath: { type: 'string' },
        cropInfo: {
          type: 'object',
          properties: {
            width: { type: 'number' },
            height: { type: 'number' },
            format: { type: 'string' },
            size: { type: 'number' },
          },
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('image'))
  async smartCropImage(
    @UploadedFile() file: Express.Multer.File,
    @Body('width') width?: string,
    @Body('height') height?: string,
    @Body('save') save?: string,
  ): Promise<{
    success: boolean;
    message: string;
    croppedPath?: string;
    cropInfo: any;
  }> {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }

    // Parse dimensions
    const targetWidth = width ? parseInt(width, 10) : 800;
    const targetHeight = height ? parseInt(height, 10) : 800;
    const shouldSave = save !== 'false'; // Default to true

    if (shouldSave) {
      // Crop and save
      const result = await this.smartCropService.cropAndSave(file.buffer, {
        width: targetWidth,
        height: targetHeight,
        outputDir: 'cropped-images',
      });

      return {
        success: true,
        message: 'Image cropped and saved successfully',
        croppedPath: result.croppedPath,
        cropInfo: result.cropInfo,
      };
    } else {
      // Just crop, don't save
      const croppedBuffer = await this.smartCropService.smartCrop(file.buffer, {
        width: targetWidth,
        height: targetHeight,
      });

      const metadata = await sharp(croppedBuffer).metadata();

      return {
        success: true,
        message: 'Image cropped successfully (not saved)',
        cropInfo: {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          size: croppedBuffer.length,
        },
      };
    }
  }

  @Post('crop/gemini')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Crop image using Gemini Vision API (Strategy 1)',
    description:
      'Use Gemini Vision API to detect and crop the main product image from social media screenshots. ' +
      'More robust but costs ~$0.001 per call. Requires GEMINI_API_KEY environment variable.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Screenshot to crop',
        },
      },
      required: ['image'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Image cropped successfully using Gemini',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        method: { type: 'string' },
        width: { type: 'number' },
        height: { type: 'number' },
        coordinates: { type: 'object' },
        confidence: { type: 'number' },
        croppedPath: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('image'))
  async cropWithGemini(@UploadedFile() file: Express.Multer.File): Promise<{
    success: boolean;
    method: string;
    width: number;
    height: number;
    coordinates: Record<string, number>;
    confidence: number;
    croppedPath?: string;
  }> {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException(
        'GEMINI_API_KEY environment variable is not set',
      );
    }

    try {
      // Encode image to base64
      const imageBase64 = file.buffer.toString('base64');

      // Call Gemini API
      const prompt = `This is a screenshot of a social media post. Return ONLY the bounding box coordinates [y_min, x_min, y_max, x_max] of the main product/content image in the post. Exclude all UI elements (headers, buttons, text, overlays). Coordinates should be normalized to 0-1000 range. Return ONLY a JSON array, nothing else. Example: [350, 0, 800, 1000]`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inline_data: {
                      mime_type: file.mimetype,
                      data: imageBase64,
                    },
                  },
                  { text: prompt },
                ],
              },
            ],
            generationConfig: { temperature: 0.1 },
          }),
        },
      );

      if (!response.ok) {
        throw new BadRequestException(
          `Gemini API failed: ${response.statusText}`,
        );
      }

      const result = await response.json();
      let text = result.candidates[0].content.parts[0].text;
      text = text
        .trim()
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      const bbox = JSON.parse(text);

      // Get image dimensions
      const metadata = await sharp(file.buffer).metadata();
      if (!metadata.width || !metadata.height) {
        throw new BadRequestException('Unable to determine image dimensions');
      }

      // Convert normalized coordinates to pixels
      const yMin = Math.max(
        0,
        Math.min(
          Math.floor((bbox[0] / 1000) * metadata.height),
          metadata.height - 1,
        ),
      );
      const xMin = Math.max(
        0,
        Math.min(
          Math.floor((bbox[1] / 1000) * metadata.width),
          metadata.width - 1,
        ),
      );
      const yMax = Math.max(
        yMin + 1,
        Math.min(
          Math.floor((bbox[2] / 1000) * metadata.height),
          metadata.height,
        ),
      );
      const xMax = Math.max(
        xMin + 1,
        Math.min(Math.floor((bbox[3] / 1000) * metadata.width), metadata.width),
      );

      // Crop image
      const croppedBuffer = await sharp(file.buffer)
        .extract({
          left: xMin,
          top: yMin,
          width: xMax - xMin,
          height: yMax - yMin,
        })
        .toBuffer();

      // Save to disk
      const outputDir = path.join(process.cwd(), 'cropped-images');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const filename = `gemini-crop-${Date.now()}.jpg`;
      const filePath = path.join(outputDir, filename);
      await sharp(croppedBuffer).toFile(filePath);

      const croppedMetadata = await sharp(croppedBuffer).metadata();

      return {
        success: true,
        method: 'gemini',
        width: croppedMetadata.width || 0,
        height: croppedMetadata.height || 0,
        coordinates: {
          y_min: yMin,
          x_min: xMin,
          y_max: yMax,
          x_max: xMax,
        },
        confidence: 0.95,
        croppedPath: filePath,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to crop image with Gemini: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  @Post('crop/yolo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Crop image using YOLOv8-Nano (Strategy 2)',
    description:
      'Use YOLOv8-Nano object detection for smart cropping. Free, fast (~50ms), very accurate. ' +
      'Requires image-cropper service running on port 8011.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Screenshot to crop',
        },
        margin: {
          type: 'string',
          description: 'Margin around detected object in pixels (default: 10)',
          example: '10',
        },
      },
      required: ['image'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Image cropped successfully using YOLO',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        method: { type: 'string' },
        width: { type: 'number' },
        height: { type: 'number' },
        coordinates: { type: 'object' },
        confidence: { type: 'number' },
        croppedPath: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('image'))
  async cropWithYolo(
    @UploadedFile() file: Express.Multer.File,
    @Body('margin') margin?: string,
  ): Promise<{
    success: boolean;
    method: string;
    width: number;
    height: number;
    coordinates: Record<string, number>;
    confidence: number;
    croppedPath?: string;
  }> {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }

    const servicePath =
      process.env.IMAGE_CROPPER_URL || 'http://localhost:8011';

    try {
      const FormDataNode = (await import('form-data')).default;
      const formData = new FormDataNode();
      formData.append('file', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });

      if (margin) {
        formData.append('margin', margin);
      }

      const axios = (await import('axios')).default;
      const response = await axios.post(`${servicePath}/crop/yolo`, formData, {
        headers: {
          ...formData.getHeaders(),
        },
      });

      const result = response.data as {
        success: boolean;
        image_base64: string;
        width: number;
        height: number;
        method: string;
        crop_coordinates: Record<string, number>;
        confidence: number;
      };

      // Decode base64 image and save
      const imageBuffer = Buffer.from(result.image_base64, 'base64');

      const outputDir = path.join(process.cwd(), 'cropped-images');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const filename = `yolo-crop-${Date.now()}.jpg`;
      const filePath = path.join(outputDir, filename);
      await sharp(imageBuffer).toFile(filePath);

      return {
        success: result.success,
        method: result.method,
        width: result.width,
        height: result.height,
        coordinates: result.crop_coordinates,
        confidence: result.confidence,
        croppedPath: filePath,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to crop image with YOLO: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  @Post('crop/opencv')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Crop image using OpenCV Python service (Strategy 3)',
    description:
      'Use OpenCV-based smart cropping via Python service. Free and fast (~5ms). ' +
      'Automatically detects light/dark mode. Requires image-cropper service running on port 8011.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Screenshot to crop',
        },
      },
      required: ['image'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Image cropped successfully using OpenCV',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        method: { type: 'string' },
        width: { type: 'number' },
        height: { type: 'number' },
        coordinates: { type: 'object' },
        confidence: { type: 'number' },
        croppedPath: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('image'))
  async cropWithOpenCV(@UploadedFile() file: Express.Multer.File): Promise<{
    success: boolean;
    method: string;
    width: number;
    height: number;
    coordinates: Record<string, number>;
    confidence: number;
    croppedPath?: string;
  }> {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }

    const servicePath =
      process.env.IMAGE_CROPPER_URL || 'http://localhost:8011';

    try {
      // Create form data
      const FormDataNode = (await import('form-data')).default;
      const formData = new FormDataNode();
      formData.append('file', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });

      // Call Python service with axios for better compatibility
      const axios = (await import('axios')).default;
      const response = await axios.post(
        `${servicePath}/crop/opencv`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
          },
        },
      );

      const result = response.data as {
        success: boolean;
        image_base64: string;
        width: number;
        height: number;
        method: string;
        crop_coordinates: Record<string, number>;
        confidence: number;
      };

      // Decode base64 image and save
      const imageBuffer = Buffer.from(result.image_base64, 'base64');

      const outputDir = path.join(process.cwd(), 'cropped-images');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const filename = `opencv-crop-${Date.now()}.jpg`;
      const filePath = path.join(outputDir, filename);
      await sharp(imageBuffer).toFile(filePath);

      return {
        success: result.success,
        method: result.method,
        width: result.width,
        height: result.height,
        coordinates: result.crop_coordinates,
        confidence: result.confidence,
        croppedPath: filePath,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to crop image with OpenCV: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private extractWords(text: string): string[] {
    if (!text) {
      return [];
    }

    return text
      .split(/[^a-zA-Z0-9_-]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
  }
}
