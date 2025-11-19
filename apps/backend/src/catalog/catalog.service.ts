import { Prisma } from '@app/generated/client';
import { Injectable, Logger } from '@nestjs/common';

import { MinioService } from '../minio/minio.service';
import { PrismaService } from '../prisma/prisma.service';

import { CatalogData, ClientInfoData } from './types/catalog.types';

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private readonly minioService: MinioService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Nettoie le clientId pour l'utiliser dans les chemins
   */
  private cleanClientId(clientId: string): string {
    if (!clientId) return 'unknown';
    return clientId.replace(/@[a-z.]+$/i, '');
  }

  /**
   * Upload une image de produit vers Minio
   */
  async uploadProductImage(
    imageBuffer: Buffer,
    productId: string,
    collectionId: string,
    clientId: string,
    imageIndex: number,
    imageType: string,
    originalFilename?: string,
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    this.logger.debug(
      `[START] Uploading product image: ${productId}-${imageIndex}`,
    );

    try {
      const cleanedClientId = this.cleanClientId(clientId);

      // Déterminer l'extension à partir du nom de fichier original
      const extension = originalFilename
        ? originalFilename.split('.').pop() || 'jpg'
        : 'jpg';

      // Construire le chemin dans Minio: {clientId}/catalog/images/{collectionId}/{productId}-{index}.{ext}
      const objectKey = `${cleanedClientId}/catalog/images/${collectionId}/${productId}-${imageIndex}.${extension}`;
      this.logger.debug(`[IMAGE-UPLOAD] Object key: ${objectKey}`);

      // Déterminer le content-type
      const contentTypeMap: { [key: string]: string } = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
      };
      const contentType =
        contentTypeMap[extension] || 'application/octet-stream';

      // Upload vers Minio
      this.logger.debug(`[IMAGE-UPLOAD] Uploading to Minio...`);
      const result = await this.minioService.uploadBuffer(
        imageBuffer,
        objectKey,
        contentType,
      );

      if (result.success) {
        this.logger.log(
          `✅ [END] Image uploaded: ${productId}-${imageIndex} (${imageType})`,
        );
        return {
          success: true,
          url: result.url,
        };
      } else {
        this.logger.error(
          `❌ [ERROR] Image upload failed: ${productId}-${imageIndex}`,
        );
        return {
          success: false,
          error: 'Upload failed',
        };
      }
    } catch (error: unknown) {
      this.logger.error(
        `❌ [ERROR] Failed to upload image ${productId}-${imageIndex}:`,
        error,
      );
      return {
        success: false,
        error: (error as Error)?.message,
      };
    }
  }

  /**
   * Upload l'avatar du compte WhatsApp vers Minio
   */
  async uploadAvatar(
    avatarBuffer: Buffer,
    clientId: string,
    originalFilename?: string,
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    this.logger.log(`[START] Uploading avatar for: ${clientId}`);

    try {
      const cleanedClientId = this.cleanClientId(clientId);

      // Déterminer l'extension
      const extension = originalFilename
        ? originalFilename.split('.').pop() || 'jpg'
        : 'jpg';

      // Chemin: {clientId}/avatar.{ext}
      const objectKey = `${cleanedClientId}/avatar.${extension}`;
      this.logger.debug(`[AVATAR-UPLOAD] Object key: ${objectKey}`);

      // Déterminer le content-type
      const contentTypeMap: { [key: string]: string } = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
      };
      const contentType =
        contentTypeMap[extension] || 'application/octet-stream';

      // Upload vers Minio
      this.logger.debug(`[AVATAR-UPLOAD] Uploading to Minio...`);
      const result = await this.minioService.uploadBuffer(
        avatarBuffer,
        objectKey,
        contentType,
      );

      if (result.success) {
        this.logger.log(`✅ [END] Avatar uploaded for ${clientId}`);
        return {
          success: true,
          url: result.url,
        };
      } else {
        this.logger.error(`❌ [ERROR] Avatar upload failed for ${clientId}`);
        return {
          success: false,
          error: 'Upload failed',
        };
      }
    } catch (error: unknown) {
      this.logger.error(
        `❌ [ERROR] Failed to upload avatar for ${clientId}:`,
        error,
      );
      return {
        success: false,
        error: (error as Error)?.message,
      };
    }
  }

  /**
   * Sauvegarde les informations du client WhatsApp en base de données
   */
  async saveClientInfo(
    clientId: string,
    clientInfo: ClientInfoData,
  ): Promise<{ success: boolean; error?: string }> {
    this.logger.log(`[START] Saving client info for: ${clientId}`);

    try {
      const cleanedClientId = '+'
        .concat(this.cleanClientId(clientId))
        .replace('++', '+');
      this.logger.debug(`[CLIENT-INFO] Cleaned clientId: ${cleanedClientId}`);

      // Trouver l'utilisateur par son numéro de téléphone (clientId)
      this.logger.debug(`[CLIENT-INFO] Finding user...`);
      const user = await this.prisma.user.findUnique({
        where: { phoneNumber: cleanedClientId },
        include: { businessInfo: true },
      });

      if (!user) {
        this.logger.error(`❌ [ERROR] User not found: ${clientId}`);
        return {
          success: false,
          error: 'User not found',
        };
      }

      this.logger.debug(
        `[CLIENT-INFO] User found: ${user.id}, has business info: ${!!user.businessInfo}`,
      );

      // Préparer les données business (avec snake_case exactement comme WhatsApp)
      this.logger.debug(`[CLIENT-INFO] Preparing business data...`);
      const businessData: Omit<Prisma.BusinessInfoCreateInput, 'user'> = {
        is_business: clientInfo.isBusiness || false,
        whatsapp_id: clientInfo.whatsappId || null,
        profile_name: clientInfo.profileName || null,
        avatar_url: clientInfo.avatarUrl || null,
        tag: clientInfo.businessProfile?.tag || null,
        description: clientInfo.businessProfile?.description || null,
        email: clientInfo.businessProfile?.email || null,
        latitude: clientInfo.businessProfile?.latitude || null,
        longitude: clientInfo.businessProfile?.longitude || null,
        categories:
          (clientInfo.businessProfile
            ?.categories as unknown as Prisma.InputJsonValue) || undefined,
        business_hours:
          (clientInfo.businessProfile
            ?.businessHours as unknown as Prisma.InputJsonValue) || undefined,
        profile_options:
          (clientInfo.businessProfile
            ?.profileOptions as unknown as Prisma.InputJsonValue) || undefined,
        website:
          clientInfo.businessProfile?.website &&
          Array.isArray(clientInfo.businessProfile.website) &&
          clientInfo.businessProfile.website.length > 0
            ? clientInfo.businessProfile.website[0].url
            : null,
      };

      // Utiliser upsert pour créer ou mettre à jour les informations business
      this.logger.debug(`[CLIENT-INFO] Upserting business info...`);
      await this.prisma.businessInfo.upsert({
        where: { user_id: user.id },
        create: {
          ...businessData,
          user: {
            connect: { id: user.id },
          },
        },
        update: businessData,
      });

      this.logger.log(
        `✅ [END] Business info upserted successfully for ${clientId}`,
      );

      return {
        success: true,
      };
    } catch (error: unknown) {
      this.logger.error(
        `❌ [ERROR] Failed to save client info for ${clientId}:`,
        error,
      );
      return {
        success: false,
        error: (error as Error)?.message,
      };
    }
  }

  /**
   * Sauvegarde le catalogue complet (collections et produits) en base de données
   */
  async saveCatalog(
    clientId: string,
    catalogData: CatalogData,
  ): Promise<{
    success: boolean;
    error?: string;
    stats?: {
      collectionsCreated: number;
      collectionsUpdated: number;
      productsCreated: number;
      productsUpdated: number;
      imagesCreated: number;
    };
  }> {
    this.logger.log(`[START] Saving catalog for: ${clientId}`);

    try {
      const cleanedClientId = '+'
        .concat(this.cleanClientId(clientId))
        .replace('++', '+');
      this.logger.debug(`[CATALOG] Cleaned clientId: ${cleanedClientId}`);

      // Trouver l'utilisateur
      this.logger.debug(`[CATALOG] Finding user...`);
      const user = await this.prisma.user.findUnique({
        where: { phoneNumber: cleanedClientId },
      });

      if (!user) {
        this.logger.error(`❌ [ERROR] User not found: ${clientId}`);
        return {
          success: false,
          error: 'User not found',
        };
      }

      this.logger.debug(`[CATALOG] User found: ${user.id}`);

      const collections = catalogData.collections || [];
      this.logger.log(
        `[CATALOG] Processing ${collections.length} collections...`,
      );

      let collectionsCreated = 0;
      let collectionsUpdated = 0;
      let productsCreated = 0;
      let productsUpdated = 0;
      let imagesCreated = 0;

      // Parcourir chaque collection
      for (const collectionData of collections) {
        const whatsappCollectionId = collectionData.id;
        this.logger.debug(
          `[CATALOG] Processing collection: ${collectionData.name} (${whatsappCollectionId})`,
        );

        // Vérifier si la collection existe
        let collection = await this.prisma.collection.findFirst({
          where: {
            user_id: user.id,
            id: whatsappCollectionId,
          },
        });

        // Créer ou mettre à jour la collection
        if (collection) {
          // Mise à jour
          this.logger.debug(
            `[CATALOG] Updating existing collection: ${collection.id}`,
          );
          collection = await this.prisma.collection.update({
            where: { id: collection.id },
            data: {
              name: collectionData.name || 'Sans nom',
              description: collectionData.description || null,
            },
          });
          collectionsUpdated++;
        } else {
          // Création
          this.logger.debug(
            `[CATALOG] Creating new collection: ${collectionData.name}`,
          );
          collection = await this.prisma.collection.create({
            data: {
              user: {
                connect: { id: user.id },
              },
              whatsapp_collection_id: whatsappCollectionId,
              name: collectionData.name || 'Sans nom',
              description: collectionData.description || null,
            },
          });
          collectionsCreated++;
        }

        // Parcourir chaque produit de la collection
        const productCount = collectionData.products?.length || 0;
        this.logger.debug(
          `[CATALOG] Processing ${productCount} products in collection ${collectionData.name}`,
        );

        for (const productData of collectionData.products || []) {
          const whatsappProductId = productData.id;
          this.logger.debug(
            `[CATALOG] Processing product: ${productData.name} (${whatsappProductId})`,
          );

          // Vérifier si le produit existe
          let product = await this.prisma.product.findFirst({
            where: {
              user_id: user.id,
              whatsapp_product_id: whatsappProductId,
            },
          });

          // Préparer les données du produit (snake_case comme WhatsApp)
          const productPayload: Prisma.ProductUpdateInput = {
            name: productData.name || 'Sans nom',
            description: productData.description || null,
            price: productData.price || null,
            currency: productData.currency || null,
            retailer_id: productData.retailer_id || null,
            availability: productData.availability || null,
            max_available: productData.max_available || null,
            is_hidden: productData.is_hidden || false,
            is_sanctioned: productData.is_sanctioned || false,
            checkmark: productData.checkmark || false,
            url: productData.url || null,
            capability_to_review_status:
              (productData.capability_to_review_status as unknown as Prisma.InputJsonValue) ||
              [],
            whatsapp_product_can_appeal:
              productData.whatsapp_product_can_appeal || false,
            image_hashes_for_whatsapp:
              productData.image_hashes_for_whatsapp || [],
            videos:
              (productData.videos as unknown as Prisma.InputJsonValue) ||
              undefined,
          };

          // Créer ou mettre à jour le produit
          if (product) {
            // Mise à jour
            this.logger.debug(
              `[CATALOG] Updating existing product: ${product.id}`,
            );
            product = await this.prisma.product.update({
              where: { id: product.id },
              data: {
                ...productPayload,
                collection: collection
                  ? {
                      connect: { id: collection.id },
                    }
                  : undefined,
              },
            });
            productsUpdated++;
          } else {
            // Création
            this.logger.debug(
              `[CATALOG] Creating new product: ${productData.name}`,
            );
            const createData: Prisma.ProductUncheckedCreateInput = {
              user_id: user.id,
              whatsapp_product_id: whatsappProductId,
              collection_id: collection?.id,
              name: productData.name || 'Sans nom',
              description: productData.description || null,
              price: productData.price || null,
              currency: productData.currency || null,
              retailer_id: productData.retailer_id || null,
              availability: productData.availability || null,
              max_available: productData.max_available || null,
              is_hidden: productData.is_hidden || false,
              is_sanctioned: productData.is_sanctioned || false,
              checkmark: productData.checkmark || false,
              url: productData.url || null,
              capability_to_review_status:
                (productData.capability_to_review_status as unknown as Prisma.InputJsonValue) ||
                [],
              whatsapp_product_can_appeal:
                productData.whatsapp_product_can_appeal || false,
              image_hashes_for_whatsapp:
                productData.image_hashes_for_whatsapp || [],
              videos:
                (productData.videos as unknown as Prisma.InputJsonValue) ||
                undefined,
            };

            product = await this.prisma.product.create({
              data: createData,
            });
            productsCreated++;
          }

          // Supprimer les anciennes images du produit
          this.logger.debug(
            `[CATALOG] Deleting old images for product: ${product.id}`,
          );
          await this.prisma.productImage.deleteMany({
            where: { product_id: product.id },
          });

          // Créer les nouvelles images du produit
          const uploadedImages = productData.uploadedImages || [];
          this.logger.debug(
            `[CATALOG] Creating ${uploadedImages.length} images for product: ${product.id}`,
          );
          for (const imageData of uploadedImages) {
            await this.prisma.productImage.create({
              data: {
                product: {
                  connect: { id: product.id },
                },
                url: imageData.url,
                original_url: imageData.originalUrl || null,
                image_type: imageData.type || 'main',
                image_index: imageData.index || 0,
              },
            });
            imagesCreated++;
          }
        }
      }

      this.logger.log(`✅ [END] Catalog saved successfully for ${clientId}:`);
      this.logger.log(
        `  - Collections: ${collectionsCreated} created, ${collectionsUpdated} updated`,
      );
      this.logger.log(
        `  - Products: ${productsCreated} created, ${productsUpdated} updated`,
      );
      this.logger.log(`  - Images: ${imagesCreated} created`);

      return {
        success: true,
        stats: {
          collectionsCreated,
          collectionsUpdated,
          productsCreated,
          productsUpdated,
          imagesCreated,
        },
      };
    } catch (error: unknown) {
      this.logger.error(
        `❌ [ERROR] Failed to save catalog for ${clientId}:`,
        error,
      );
      return {
        success: false,
        error: (error as Error)?.message,
      };
    }
  }
}
