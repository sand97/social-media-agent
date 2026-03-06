export interface PersistedCatalogImage {
  id: string;
  original_url: string | null;
  normalized_url: string | null;
  url: string;
}

export interface CatalogImageMinioCheckResult<
  TImage extends PersistedCatalogImage = PersistedCatalogImage,
> {
  image: TImage;
  objectKey: string | null;
}

interface PartitionCatalogImagesOptions {
  getObjectKeyFromUrl: (url: string) => string | null;
  fileExists: (objectKey: string) => Promise<boolean | null>;
  batchSize?: number;
}

export function normalizeStoredCatalogImageUrl(
  image: Pick<PersistedCatalogImage, 'normalized_url' | 'original_url'>,
): string | null {
  if (image.normalized_url) {
    return image.normalized_url;
  }

  if (image.original_url) {
    return image.original_url.split('?')[0];
  }

  return null;
}

export async function partitionCatalogImagesByMinioPresence<
  TImage extends PersistedCatalogImage,
>(
  images: TImage[],
  options: PartitionCatalogImagesOptions,
): Promise<{
  reusableImages: TImage[];
  missingImageIds: string[];
  missingImages: CatalogImageMinioCheckResult<TImage>[];
  unverifiableImages: CatalogImageMinioCheckResult<TImage>[];
  invalidUrlImages: CatalogImageMinioCheckResult<TImage>[];
}> {
  const reusableImages: TImage[] = [];
  const missingImageIds: string[] = [];
  const missingImages: CatalogImageMinioCheckResult<TImage>[] = [];
  const unverifiableImages: CatalogImageMinioCheckResult<TImage>[] = [];
  const invalidUrlImages: CatalogImageMinioCheckResult<TImage>[] = [];
  const batchSize = options.batchSize ?? 20;

  for (let index = 0; index < images.length; index += batchSize) {
    const batch = images.slice(index, index + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (image) => {
        const objectKey = options.getObjectKeyFromUrl(image.url);

        if (!objectKey) {
          return {
            image,
            objectKey: null,
            status: 'invalid_url' as const,
          };
        }

        const exists = await options.fileExists(objectKey);

        if (exists === true) {
          return {
            image,
            objectKey,
            status: 'exists' as const,
          };
        }

        if (exists === false) {
          return {
            image,
            objectKey,
            status: 'missing' as const,
          };
        }

        return {
          image,
          objectKey,
          status: 'unverifiable' as const,
        };
      }),
    );

    for (const result of batchResults) {
      if (result.status === 'missing') {
        missingImageIds.push(result.image.id);
        missingImages.push({
          image: result.image,
          objectKey: result.objectKey,
        });
        continue;
      }

      if (result.status === 'invalid_url') {
        invalidUrlImages.push({
          image: result.image,
          objectKey: result.objectKey,
        });
      } else if (result.status === 'unverifiable') {
        unverifiableImages.push({
          image: result.image,
          objectKey: result.objectKey,
        });
      }

      reusableImages.push(result.image);
    }
  }

  return {
    reusableImages,
    missingImageIds,
    missingImages,
    unverifiableImages,
    invalidUrlImages,
  };
}
