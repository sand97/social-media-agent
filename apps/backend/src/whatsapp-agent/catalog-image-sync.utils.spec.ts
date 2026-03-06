import {
  normalizeStoredCatalogImageUrl,
  partitionCatalogImagesByMinioPresence,
} from './catalog-image-sync.utils';

describe('catalog-image-sync.utils', () => {
  it('normalizes the stored catalog image URL from original_url when needed', () => {
    expect(
      normalizeStoredCatalogImageUrl({
        normalized_url: null,
        original_url: 'https://media.whatsapp.net/image.jpg?token=123',
      }),
    ).toBe('https://media.whatsapp.net/image.jpg');
  });

  it('marks confirmed missing MinIO objects for deletion', async () => {
    const result = await partitionCatalogImagesByMinioPresence(
      [
        {
          id: 'img-missing',
          original_url: 'https://media.whatsapp.net/missing.jpg?token=1',
          normalized_url: 'https://media.whatsapp.net/missing.jpg',
          url: 'https://files-flemme.bedones.com/whatsapp-agent/agent/catalog/images/missing.jpg',
        },
        {
          id: 'img-valid',
          original_url: 'https://media.whatsapp.net/valid.jpg?token=1',
          normalized_url: 'https://media.whatsapp.net/valid.jpg',
          url: 'https://files-flemme.bedones.com/whatsapp-agent/agent/catalog/images/valid.jpg',
        },
      ],
      {
        getObjectKeyFromUrl: (url) =>
          url.includes('missing')
            ? 'agent/catalog/images/missing.jpg'
            : 'agent/catalog/images/valid.jpg',
        fileExists: async (objectKey) => !objectKey.includes('missing'),
        batchSize: 1,
      },
    );

    expect(result).toEqual({
      reusableImages: [
        {
          id: 'img-valid',
          original_url: 'https://media.whatsapp.net/valid.jpg?token=1',
          normalized_url: 'https://media.whatsapp.net/valid.jpg',
          url: 'https://files-flemme.bedones.com/whatsapp-agent/agent/catalog/images/valid.jpg',
        },
      ],
      missingImageIds: ['img-missing'],
      missingImages: [
        {
          image: {
            id: 'img-missing',
            original_url: 'https://media.whatsapp.net/missing.jpg?token=1',
            normalized_url: 'https://media.whatsapp.net/missing.jpg',
            url: 'https://files-flemme.bedones.com/whatsapp-agent/agent/catalog/images/missing.jpg',
          },
          objectKey: 'agent/catalog/images/missing.jpg',
        },
      ],
      unverifiableImages: [],
      invalidUrlImages: [],
    });
  });

  it('keeps images when MinIO cannot verify their state', async () => {
    const images = [
      {
        id: 'img-unverifiable',
        original_url: 'https://media.whatsapp.net/unverifiable.jpg?token=1',
        normalized_url: 'https://media.whatsapp.net/unverifiable.jpg',
        url: 'https://files-flemme.bedones.com/whatsapp-agent/agent/catalog/images/unverifiable.jpg',
      },
      {
        id: 'img-invalid-url',
        original_url: 'https://media.whatsapp.net/invalid.jpg?token=1',
        normalized_url: 'https://media.whatsapp.net/invalid.jpg',
        url: 'not-a-minio-url',
      },
    ];

    const result = await partitionCatalogImagesByMinioPresence(images, {
      getObjectKeyFromUrl: (url) =>
        url === 'not-a-minio-url'
          ? null
          : 'agent/catalog/images/unverifiable.jpg',
      fileExists: async () => null,
    });

    expect(result).toEqual({
      reusableImages: images,
      missingImageIds: [],
      missingImages: [],
      unverifiableImages: [
        {
          image: images[0],
          objectKey: 'agent/catalog/images/unverifiable.jpg',
        },
      ],
      invalidUrlImages: [
        {
          image: images[1],
          objectKey: null,
        },
      ],
    });
  });
});
