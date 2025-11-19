export interface DownloadedImage {
  productId: string;
  imageData: string;
  originalUrl: string;
  imageIndex: number;
  imageType: string;
}

export interface ImageUrl {
  url: string;
  type: string;
  index: number;
}
