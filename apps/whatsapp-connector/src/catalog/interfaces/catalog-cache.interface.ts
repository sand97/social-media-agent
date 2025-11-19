export interface CachedImage {
  url: string;
  fileName: string;
  filePath: string;
  productId: string;
  imageIndex: number;
  downloadedAt: string;
  size: number;
}

export interface CatalogCache {
  images: CachedImage[];
}
