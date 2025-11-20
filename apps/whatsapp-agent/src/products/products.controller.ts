import { Body, Controller, Post, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { AnalysisResultDto } from './dto/analysis-result.dto';
import { AnalyzeProductDto } from './dto/analyze-product.dto';
import { ProductsAnalysisService } from './products-analysis.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  private readonly logger = new Logger(ProductsController.name);

  constructor(
    private readonly productsAnalysisService: ProductsAnalysisService,
  ) {}

  @Post('analyze')
  @ApiOperation({
    summary: 'Analyser un produit avec IA',
    description:
      "Analyse un produit pour détecter les erreurs d'orthographe, suggérer des métadonnées et améliorer la description",
  })
  @ApiResponse({
    status: 200,
    description: 'Analyse réussie',
    type: AnalysisResultDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Données invalides',
  })
  @ApiResponse({
    status: 500,
    description: "Erreur lors de l'analyse",
  })
  async analyzeProduct(
    @Body() analyzeProductDto: AnalyzeProductDto,
  ): Promise<AnalysisResultDto> {
    this.logger.log(
      `Received analysis request for product: ${analyzeProductDto.name}`,
    );

    try {
      const result =
        await this.productsAnalysisService.analyzeProduct(analyzeProductDto);
      this.logger.log('Analysis completed successfully');
      return result;
    } catch (error: any) {
      this.logger.error('Analysis failed:', error.message);
      throw error;
    }
  }
}
