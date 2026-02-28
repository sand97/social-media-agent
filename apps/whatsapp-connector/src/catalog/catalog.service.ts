/* eslint-disable no-undef */
import * as fs from 'fs';
import * as path from 'path';

import { Injectable, Logger } from '@nestjs/common';

import { MinioService } from '../minio/minio.service';

import {
  CachedImage,
  CatalogCache,
} from './interfaces/catalog-cache.interface';
import { DownloadedImage } from './interfaces/catalog-image.interface';

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);
  private readonly tempDir = path.join(process.cwd(), 'temp');
  private readonly tempImagesDir = path.join(this.tempDir, 'images');
  private readonly cacheFilePath = path.join(this.tempDir, 'infos.json');

  constructor(private readonly minioService: MinioService) {}

  /**
   * Nettoie le clientId pour l'utiliser dans les noms de fichiers et clés S3
   * Enlève les caractères spéciaux comme @c.us
   */
  private cleanClientId(clientId: string): string {
    if (!clientId) return 'unknown';
    // Enlever le suffixe WhatsApp (@c.us, @s.whatsapp.net, etc.) puis
    // supprimer tout caractère non alphanumérique pour des clés Minio stables.
    const withoutWhatsappSuffix = clientId.replace(/@[a-z.]+$/i, '');
    const sanitized = withoutWhatsappSuffix.replace(/[^a-zA-Z0-9]/g, '');
    return sanitized || 'unknown';
  }

  /**
   * Récupère le catalogue et télécharge les images depuis Puppeteer
   * @param page - Page Puppeteer (type any pour éviter la dépendance directe à puppeteer-core)
   */
  async fetchCatalogWithImages(
    page: any,
  ): Promise<{ catalog: any[]; images: DownloadedImage[] }> {
    this.logger.log('🔍 Récupération du catalogue via WPP...');

    const catalogWithImages = await page.evaluate(
      async (): Promise<{
        catalog: any[];
        images: Array<{
          productId: string;
          imageData: string;
          originalUrl: string;
          imageIndex: number;
          imageType: string;
        }>;
      }> => {
        const userId = window.WPP.conn?.getMyUserId()?._serialized || '';
        if (!userId) {
          throw new Error('User ID not found');
        }
        const whatsappApi = window.WPP.whatsapp as any;

        const productsById = new Map<string, any>();

        const addProduct = (rawProduct: any) => {
          const product = rawProduct?.attributes || rawProduct;
          if (!product?.id) return;
          if (!productsById.has(product.id)) {
            productsById.set(product.id, product);
          }
        };

        const extractProductsFromCatalog = (catalogEntry: any): any[] => {
          if (!catalogEntry) return [];
          const productIndex = catalogEntry.productCollection?._index;
          if (!productIndex || typeof productIndex !== 'object') return [];
          return Object.keys(productIndex)
            .map((productId) => productIndex[productId]?.attributes)
            .filter(Boolean);
        };

        // 1) queryCatalog paginé
        if (whatsappApi?.functions?.queryCatalog) {
          try {
            let afterToken: string | undefined = undefined;
            while (true) {
              const response = await whatsappApi.functions.queryCatalog(
                userId as any,
                afterToken,
              );
              const pageProducts = Array.isArray(response?.data)
                ? response.data
                : [];
              for (const product of pageProducts) {
                addProduct(product);
              }

              const nextAfter = response?.paging?.cursors?.after;
              if (!nextAfter || nextAfter === afterToken) break;
              afterToken = nextAfter;
            }
          } catch (error) {
            console.log('⚠️ queryCatalog indisponible:', error.message);
          }
        }

        // 2) CatalogStore.findQuery
        if (whatsappApi?.CatalogStore?.findQuery) {
          try {
            const catalogStoreResults =
              await whatsappApi.CatalogStore.findQuery(userId as any);
            if (Array.isArray(catalogStoreResults)) {
              for (const entry of catalogStoreResults) {
                const products = extractProductsFromCatalog(entry);
                for (const product of products) {
                  addProduct(product);
                }
              }
            }
          } catch (error) {
            console.log(
              '⚠️ CatalogStore.findQuery indisponible:',
              error.message,
            );
          }
        }

        // 3) Fallback getMyCatalog
        try {
          const myCatalog = await window.WPP.catalog.getMyCatalog();
          const fallbackProducts = extractProductsFromCatalog(myCatalog);
          for (const product of fallbackProducts) {
            addProduct(product);
          }
        } catch (error) {
          console.log('⚠️ getMyCatalog indisponible:', error.message);
        }

        // 4) Dernier fallback getProducts
        if (productsById.size === 0) {
          try {
            const fallbackProducts = await window.WPP.catalog.getProducts(
              userId,
              999,
            );
            if (Array.isArray(fallbackProducts)) {
              for (const product of fallbackProducts) {
                addProduct(product);
              }
            }
          } catch (error) {
            console.log('⚠️ getProducts indisponible:', error.message);
          }
        }

        const catalog = Array.from(productsById.values());
        console.log(`📦 Catalogue récupéré: ${catalog.length} produits`);

        if (!catalog || !Array.isArray(catalog)) {
          return { catalog: [], images: [] };
        }

        const images: Array<{
          productId: string;
          imageData: string;
          originalUrl: string;
          imageIndex: number;
          imageType: string;
        }> = [];

        // Télécharger toutes les images dans le navigateur
        for (const product of catalog) {
          try {
            const imageUrls: Array<{
              url: string;
              type: string;
              index: number;
            }> = [];

            const pickPreferredCdnUrl = (variants: any[]): string | null => {
              if (!Array.isArray(variants)) return null;
              const full = variants.find((img) => img?.key === 'full');
              if (full?.value) return full.value;
              const requested = variants.find(
                (img) => img?.key === 'requested',
              );
              return requested?.value || null;
            };

            // 1. Image principale dans image_cdn_urls
            const mainImageUrl =
              product.imageCdnUrl ||
              product.image_cdn_url ||
              pickPreferredCdnUrl(product.image_cdn_urls);
            if (mainImageUrl) {
              imageUrls.push({
                url: mainImageUrl,
                type: 'main',
                index: 0,
              });
            }

            // 2. Images additionnelles dans additional_image_cdn_urls
            if (Array.isArray(product.additionalImageCdnUrl)) {
              product.additionalImageCdnUrl.forEach((url, index) => {
                if (url) {
                  imageUrls.push({
                    url,
                    type: 'additional',
                    index: index + 1,
                  });
                }
              });
            } else if (
              product.additional_image_cdn_urls &&
              Array.isArray(product.additional_image_cdn_urls)
            ) {
              product.additional_image_cdn_urls.forEach((imgArray, index) => {
                const imageUrl = pickPreferredCdnUrl(imgArray);
                if (!imageUrl) return;
                imageUrls.push({
                  url: imageUrl,
                  type: 'additional',
                  index: index + 1,
                });
              });
            }

            // Télécharger toutes les images du produit
            for (const imageInfo of imageUrls) {
              try {
                const response = await fetch(imageInfo.url, {
                  method: 'GET',
                  credentials: 'include',
                  headers: {
                    'User-Agent': navigator.userAgent,
                    Referer: 'https://web.whatsapp.com/',
                    Origin: 'https://web.whatsapp.com',
                  },
                });

                if (!response.ok) {
                  console.error(
                    `❌ Erreur HTTP ${response.status} ${response.statusText} pour ${product.id} image ${imageInfo.index}`,
                  );
                  continue;
                }

                const blob = await response.blob();
                console.log(
                  `   📦 Blob reçu: ${blob.size} bytes, type: ${blob.type}`,
                );

                if (blob.size === 0) {
                  console.error(
                    `❌ Blob vide pour ${product.id} image ${imageInfo.index}`,
                  );
                  continue;
                }

                const base64 = await new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result);
                  reader.onerror = reject;
                  reader.readAsDataURL(blob);
                });

                images.push({
                  productId: product.id,
                  imageData: base64 as string,
                  originalUrl: imageInfo.url,
                  imageIndex: imageInfo.index,
                  imageType: imageInfo.type,
                });
              } catch (imgError) {
                console.error(
                  `❌ Erreur téléchargement image ${imageInfo.index} du produit ${product.id}:`,
                  imgError.message,
                );
              }
            }

            if (imageUrls.length === 0) {
              console.warn(`⚠️  Pas d'URL d'image pour produit ${product.id}`);
            }
          } catch (error) {
            console.error(
              `❌ Erreur téléchargement ${product.id}:`,
              error.message,
            );
          }
        }

        return { catalog, images };
      },
    );

    this.logger.log(
      `📦 Catalogue reçu: ${catalogWithImages.catalog?.length || 0} produits, ${catalogWithImages.images?.length || 0} images téléchargées`,
    );

    return catalogWithImages;
  }

  /**
   * Sauvegarde les images téléchargées avec système de cache
   */
  async saveImages(
    images: DownloadedImage[],
    clientId: string,
  ): Promise<{ downloaded: number; cached: number; errors: number }> {
    if (!images || images.length === 0) {
      this.logger.warn('⚠️  Aucune image à sauvegarder');
      return { downloaded: 0, cached: 0, errors: 0 };
    }

    // Nettoyer le clientId (enlever @c.us, etc.)
    const cleanedClientId = this.cleanClientId(clientId);

    // Créer les dossiers nécessaires
    this.ensureDirectoriesExist();

    // Charger le cache
    const cache = this.loadCache();
    const cacheMap = new Map(cache.images.map((img) => [img.url, img]));

    this.logger.log(`🆔 Client ID: ${clientId} (cleaned: ${cleanedClientId})`);

    let downloadedCount = 0;
    let cachedCount = 0;
    let errorCount = 0;

    for (const imageInfo of images) {
      try {
        // Vérifier le cache
        const cachedImage = cacheMap.get(imageInfo.originalUrl);
        if (cachedImage && fs.existsSync(cachedImage.filePath)) {
          this.logger.log(
            `💾 Image en cache: ${cachedImage.fileName} (produit ${imageInfo.productId}, index ${imageInfo.imageIndex})`,
          );
          cachedCount++;
          continue;
        }

        // Extraire le contenu base64 et l'extension
        const matches = imageInfo.imageData.match(
          /^data:image\/([a-zA-Z]+);base64,(.+)$/,
        );

        if (matches && matches.length === 3) {
          const extension = matches[1];
          const base64Data = matches[2];

          // Nom du fichier: [client-id]-[product-id]-[image-index].jpg
          const imageIndex = imageInfo.imageIndex || 0;
          const fileName = `${cleanedClientId}-${imageInfo.productId}-${imageIndex}.${extension}`;
          const filePath = path.join(this.tempImagesDir, fileName);

          // Sauvegarder l'image localement
          fs.writeFileSync(filePath, base64Data, 'base64');

          this.logger.log(
            `✅ Image sauvegardée localement: ${fileName} (${Math.round(base64Data.length / 1024)}KB)`,
          );

          // Upload vers Minio
          const minioImagePath = `${cleanedClientId}/catalog/images/${fileName}`;
          const uploaded = await this.minioService.uploadFile(
            filePath,
            minioImagePath,
          );

          if (uploaded) {
            this.logger.log(`☁️  Image uploadée vers Minio: ${minioImagePath}`);
          }

          // Ajouter au cache
          cache.images.push({
            url: imageInfo.originalUrl,
            fileName,
            filePath,
            productId: imageInfo.productId,
            imageIndex,
            downloadedAt: new Date().toISOString(),
            size: base64Data.length,
          });

          downloadedCount++;
        } else {
          this.logger.warn(
            `⚠️  Format base64 invalide pour produit ${imageInfo.productId}`,
          );
          errorCount++;
        }
      } catch (error: any) {
        this.logger.error(
          `❌ Erreur sauvegarde image produit ${imageInfo.productId}: ${error.message}`,
        );
        errorCount++;
      }
    }

    // Sauvegarder le cache localement
    this.saveCache(cache);

    // Upload le cache vers Minio
    await this.uploadCacheToMinio(cache, cleanedClientId);

    this.logger.log(
      `✅ Traitement terminé - ${downloadedCount} nouvelle(s) image(s), ${cachedCount} en cache, ${errorCount} erreur(s)`,
    );

    return {
      downloaded: downloadedCount,
      cached: cachedCount,
      errors: errorCount,
    };
  }

  /**
   * Upload le cache vers Minio
   */
  private async uploadCacheToMinio(
    cache: CatalogCache,
    clientId: string,
  ): Promise<void> {
    try {
      const minioCachePath = `${clientId}/catalog/infos.json`;
      const uploaded = await this.minioService.uploadJson(
        minioCachePath,
        cache,
      );

      if (uploaded) {
        this.logger.log(`☁️  Cache uploadé vers Minio: ${minioCachePath}`);
      }
    } catch (error: any) {
      this.logger.error(`❌ Erreur upload cache vers Minio: ${error.message}`);
    }
  }

  /**
   * Charge le cache depuis le fichier
   */
  private loadCache(): CatalogCache {
    if (fs.existsSync(this.cacheFilePath)) {
      try {
        const cacheContent = fs.readFileSync(this.cacheFilePath, 'utf8');
        const cache = JSON.parse(cacheContent);
        this.logger.log(
          `📋 Cache chargé: ${cache.images.length} image(s) en cache`,
        );
        return cache;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        this.logger.warn('⚠️  Erreur lecture cache, création nouveau');
        return { images: [] };
      }
    }
    return { images: [] };
  }

  /**
   * Sauvegarde le cache dans le fichier
   */
  private saveCache(cache: CatalogCache): void {
    try {
      fs.writeFileSync(
        this.cacheFilePath,
        JSON.stringify(cache, null, 2),
        'utf8',
      );
      this.logger.log(
        `💾 Cache sauvegardé: ${cache.images.length} image(s) au total`,
      );
    } catch (error: any) {
      this.logger.error(`❌ Erreur sauvegarde cache: ${error.message}`);
    }
  }

  /**
   * S'assure que les dossiers existent
   */
  private ensureDirectoriesExist(): void {
    if (!fs.existsSync(this.tempImagesDir)) {
      fs.mkdirSync(this.tempImagesDir, { recursive: true });
      this.logger.log(`📁 Dossier créé: ${this.tempImagesDir}`);
    }
  }

  /**
   * Nettoie les images en cache plus anciennes que X jours
   */
  cleanOldCachedImages(daysOld: number = 30): number {
    const cache = this.loadCache();
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - daysOld * 24 * 60 * 60 * 1000);

    const imagesToKeep: CachedImage[] = [];
    let deletedCount = 0;

    for (const cachedImage of cache.images) {
      const downloadedAt = new Date(cachedImage.downloadedAt);

      if (downloadedAt < cutoffDate) {
        // Supprimer le fichier
        try {
          if (fs.existsSync(cachedImage.filePath)) {
            fs.unlinkSync(cachedImage.filePath);
            this.logger.log(`🗑️  Image supprimée: ${cachedImage.fileName}`);
            deletedCount++;
          }
        } catch (error: any) {
          this.logger.error(
            `❌ Erreur suppression ${cachedImage.fileName}: ${error.message}`,
          );
        }
      } else {
        imagesToKeep.push(cachedImage);
      }
    }

    // Mettre à jour le cache
    cache.images = imagesToKeep;
    this.saveCache(cache);

    this.logger.log(
      `✅ Nettoyage terminé: ${deletedCount} image(s) supprimée(s)`,
    );
    return deletedCount;
  }
}
