import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AgentContext } from '../common/decorators/agent-context.decorator';
import { AgentInternalGuard } from '../common/guards/agent-internal.guard';
import type { AgentRequestContext } from '../common/guards/agent-internal.guard';

import { BatchUpdateProductImageIndexingDto } from './dto/batch-update-product-image-indexing.dto';
import { ProductsInternalService } from './products-internal.service';
import {
  parseKeywordsQuery,
  parsePositiveIntQuery,
} from './utils/products-query.utils';

@ApiTags('products')
@ApiBearerAuth()
@Controller('agent-internal/products')
@UseGuards(AgentInternalGuard)
export class ProductsInternalController {
  constructor(
    private readonly productsInternalService: ProductsInternalService,
  ) {}

  @Get('sample')
  @ApiOperation({
    summary: 'Récupérer un échantillon de produits',
    description:
      'Endpoint interne backend, appelé par le whatsapp-agent pour récupérer un échantillon représentatif du catalogue (génération/mise à jour du prompt de description image). Non destiné au frontend.',
  })
  @ApiResponse({
    status: 200,
    description: "Échantillon de produits de l'agent retourné",
  })
  @ApiResponse({
    status: 401,
    description: 'JWT inter-services invalide ou absent',
  })
  async getSampleProducts(
    @AgentContext() context: AgentRequestContext,
    @Query('max') max?: string,
    @Query('perCollection') perCollection?: string,
  ) {
    const maxProducts = parsePositiveIntQuery(max, 20);
    const maxPerCollection = parsePositiveIntQuery(perCollection, 3);

    return this.productsInternalService.getSampleProducts(
      context.userId,
      maxProducts,
      maxPerCollection,
    );
  }

  @Get('by-retailer-id/:retailerId')
  @ApiOperation({
    summary: 'Trouver un produit par retailer_id',
    description:
      'Endpoint interne backend, appelé par le pipeline image du whatsapp-agent après OCR pour matcher rapidement un produit via son code retailer.',
  })
  @ApiResponse({
    status: 200,
    description: 'Produit correspondant retourné (ou null)',
  })
  @ApiResponse({
    status: 400,
    description: 'retailerId manquant ou invalide',
  })
  @ApiResponse({
    status: 401,
    description: 'JWT inter-services invalide ou absent',
  })
  async getProductByRetailerId(
    @AgentContext() context: AgentRequestContext,
    @Param('retailerId') retailerId: string,
  ) {
    const normalizedRetailerId = retailerId?.trim();
    if (!normalizedRetailerId) {
      throw new BadRequestException('retailerId is required');
    }

    return this.productsInternalService.getProductByRetailerId(
      context.userId,
      normalizedRetailerId,
    );
  }

  @Get('by-id/:productId')
  @ApiOperation({
    summary: 'Trouver un produit par identifiant interne/WhatsApp/retailer',
    description:
      "Endpoint interne backend, appelé par le whatsapp-agent pour résoudre un identifiant produit vers le produit métier et son whatsapp_product_id.",
  })
  @ApiResponse({
    status: 200,
    description: 'Produit correspondant retourné (ou null)',
  })
  @ApiResponse({
    status: 400,
    description: 'productId manquant ou invalide',
  })
  @ApiResponse({
    status: 401,
    description: 'JWT inter-services invalide ou absent',
  })
  async getProductByAnyId(
    @AgentContext() context: AgentRequestContext,
    @Param('productId') productId: string,
  ) {
    const normalizedProductId = productId?.trim();
    if (!normalizedProductId) {
      throw new BadRequestException('productId is required');
    }

    return this.productsInternalService.getProductByAnyId(
      context.userId,
      normalizedProductId,
    );
  }

  @Get('by-ids')
  @ApiOperation({
    summary:
      'Trouver plusieurs produits par identifiants interne/WhatsApp/retailer',
    description:
      "Endpoint interne backend, appelé par le whatsapp-agent pour résoudre plusieurs identifiants produit et récupérer les données nécessaires à la construction d'une preview de lien produit.",
  })
  @ApiResponse({
    status: 200,
    description: 'Liste ordonnée des correspondances retournée',
  })
  @ApiResponse({
    status: 400,
    description: 'Aucun identifiant valide fourni',
  })
  @ApiResponse({
    status: 401,
    description: 'JWT inter-services invalide ou absent',
  })
  async getProductsByAnyIds(
    @AgentContext() context: AgentRequestContext,
    @Query('ids') ids: string | string[],
  ) {
    const parsedIds = parseKeywordsQuery(ids);

    if (parsedIds.length === 0) {
      throw new BadRequestException('At least one id is required');
    }

    return this.productsInternalService.getProductsByAnyIds(
      context.userId,
      parsedIds,
    );
  }

  @Get('search-by-keywords')
  @ApiOperation({
    summary: 'Rechercher des produits par mots-clés',
    description:
      'Endpoint interne backend, appelé par le whatsapp-agent pour la recherche OCR textuelle. Réutilise la logique métier existante ProductsService.searchByKeywords.',
  })
  @ApiResponse({
    status: 200,
    description: 'Produits et mots-clés matchés retournés',
  })
  @ApiResponse({
    status: 400,
    description: 'Aucun mot-clé valide fourni',
  })
  @ApiResponse({
    status: 401,
    description: 'JWT inter-services invalide ou absent',
  })
  async searchProductsByKeywords(
    @AgentContext() context: AgentRequestContext,
    @Query('keywords') keywords: string | string[],
    @Query('retailer_id') retailerId?: string,
  ) {
    const parsedKeywords = parseKeywordsQuery(keywords);

    if (parsedKeywords.length === 0) {
      throw new BadRequestException('At least one keyword is required');
    }

    return this.productsInternalService.searchProductsByKeywords(
      context.userId,
      parsedKeywords,
      retailerId,
    );
  }

  @Patch('cover-image-descriptions')
  @ApiOperation({
    summary:
      "Mettre à jour en batch les descriptions de cover et états d'indexation",
    description:
      "Endpoint interne backend, appelé par le whatsapp-agent en fin d'indexation pour persister en une seule requête les descriptions de cover et remettre les flags d'indexation à false (produits et images).",
  })
  @ApiResponse({
    status: 200,
    description: 'Batch appliqué sur les produits appartenant à cet agent',
  })
  @ApiResponse({
    status: 401,
    description: 'JWT inter-services invalide ou absent',
  })
  async batchUpdateProductImageIndexing(
    @AgentContext() context: AgentRequestContext,
    @Body() dto: BatchUpdateProductImageIndexingDto,
  ) {
    return this.productsInternalService.batchUpdateImageIndexing(
      context.userId,
      dto.updates,
    );
  }

  @Get('for-image-indexing')
  @ApiOperation({
    summary: "Lister les produits pour l'indexation image",
    description:
      'Endpoint interne backend, appelé par le whatsapp-agent pour récupérer les produits et leurs images de couverture à indexer dans Qdrant (traitement fait côté agent).',
  })
  @ApiResponse({
    status: 200,
    description: "Liste de produits prêts pour l'indexation image",
  })
  @ApiResponse({
    status: 401,
    description: 'JWT inter-services invalide ou absent',
  })
  async getProductsForImageIndexing(
    @AgentContext() context: AgentRequestContext,
  ) {
    return this.productsInternalService.getProductsForImageIndexing(
      context.userId,
    );
  }
}
