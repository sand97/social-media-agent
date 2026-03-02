import { describe, expect, it, vi } from 'vitest';

import { CatalogSearchService } from '../../../src/catalog/catalog-search.service';

describe('CatalogSearchService reranking', () => {
  it('prioritizes lexical entity matches for short name queries', async () => {
    const embeddingsService = {
      isAvailable: vi.fn().mockReturnValue(true),
      embedText: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    };

    const qdrantService = {
      isConfigured: vi.fn().mockReturnValue(true),
      searchSimilarText: vi.fn().mockResolvedValue([
        {
          productId: 'real-away',
          score: 0.54,
          metadata: {
            product_name: 'Réal extérieur',
            description: 'Maillot extérieur du Real Madrid',
          },
        },
        {
          productId: 'barca-home',
          score: 0.63,
          metadata: {
            product_name: 'Barcelone Domicile',
            description: 'Maillot du FC Barcelone',
          },
        },
        {
          productId: 'barca-away',
          score: 0.61,
          metadata: {
            product_name: 'Barcelone extérieur',
            description: 'Collection FC Barcelona',
          },
        },
      ]),
    };

    const service = new CatalogSearchService(
      embeddingsService as any,
      qdrantService as any,
    );

    const result = await service.searchProducts('Barcelone', 5);

    expect(result.success).toBe(true);
    expect(result.products.length).toBe(2);
    expect(result.products[0].name).toContain('Barcelone');
    expect(result.products[1].name).toContain('Barcelone');
    expect(
      result.products.some((product) => product.name.includes('Réal')),
    ).toBe(false);
  });

  it('uses query_en to prioritize english cover image matches', async () => {
    const embeddingsService = {
      isAvailable: vi.fn().mockReturnValue(true),
      embedText: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    };

    const qdrantService = {
      isConfigured: vi.fn().mockReturnValue(true),
      searchSimilarText: vi
        .fn()
        // primary query
        .mockResolvedValueOnce([
          {
            productId: 'real-away',
            score: 0.66,
            metadata: {
              product_name: 'Réal extérieur',
              description: 'Maillot extérieur du Real Madrid',
              cover_image_description:
                'Football Jersey: Real Madrid Away. Colors: Navy and Silver.',
            },
          },
          {
            productId: 'barca-home',
            score: 0.62,
            metadata: {
              product_name: 'Barcelone Domicile',
              description: 'Maillot du FC Barcelone',
              cover_image_description:
                'Football Jersey: FC Barcelona Home. Colors: Blue and Red.',
            },
          },
        ])
        // query_en
        .mockResolvedValueOnce([
          {
            productId: 'barca-home',
            score: 0.71,
            metadata: {
              product_name: 'Barcelone Domicile',
              description: 'Maillot du FC Barcelone',
              cover_image_description:
                'Football Jersey: FC Barcelona Home. Colors: Blue and Red.',
            },
          },
          {
            productId: 'real-away',
            score: 0.52,
            metadata: {
              product_name: 'Réal extérieur',
              description: 'Maillot extérieur du Real Madrid',
              cover_image_description:
                'Football Jersey: Real Madrid Away. Colors: Navy and Silver.',
            },
          },
        ]),
    };

    const service = new CatalogSearchService(
      embeddingsService as any,
      qdrantService as any,
    );

    const result = await service.searchProducts(
      'maillot barca',
      5,
      'barcelona jersey',
    );

    expect(result.success).toBe(true);
    expect(result.products.length).toBe(1);
    expect(result.products[0].name).toContain('Barcelone');
    expect(typeof result.products[0].rankingScore).toBe('number');
  });
});
