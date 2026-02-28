import { Prisma } from '@app/generated/client';
import { normalizeWhatsAppPrice } from '@apps/common';
import { Injectable, Logger } from '@nestjs/common';

import { MinioService } from '../minio/minio.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserSyncService } from '../whatsapp-agent/user-sync.service';
import { WhatsAppAgentClientService } from '../whatsapp-agent/whatsapp-agent-client.service';
import { WhatsAppAgentService } from '../whatsapp-agent/whatsapp-agent.service';

import { CatalogData, ClientInfoData } from './types/catalog.types';

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private readonly minioService: MinioService,
    private readonly prisma: PrismaService,
    private readonly whatsappAgentService: WhatsAppAgentService,
    private readonly userSyncService: UserSyncService,
    private readonly whatsappAgentClient: WhatsAppAgentClientService,
  ) {}

  /**
   * Nettoie le clientId pour l'utiliser dans les chemins
   */
  private cleanClientId(clientId: string): string {
    if (!clientId) return 'unknown';
    const withoutWhatsappSuffix = clientId.replace(/@[a-z.]+$/i, '');
    const sanitized = withoutWhatsappSuffix.replace(/[^a-zA-Z0-9]/g, '');
    return sanitized || 'unknown';
  }

  /**
   * Résout le préfixe de stockage public à partir du clientId WhatsApp.
   * Le préfixe doit être l'ID unique de l'agent (pas le numéro de téléphone).
   */
  private async resolveAgentStorageContext(clientId: string): Promise<{
    cleanedPhoneNumber: string;
    userId: string;
    agentId: string;
  }> {
    const cleanedPhoneNumber = '+'
      .concat(this.cleanClientId(clientId))
      .replace('++', '+');

    const user = await this.prisma.user.findUnique({
      where: { phoneNumber: cleanedPhoneNumber },
      select: {
        id: true,
        whatsappAgent: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error(`User not found for phone number: ${cleanedPhoneNumber}`);
    }

    const agentId = user.whatsappAgent?.id;
    if (!agentId) {
      throw new Error(
        `WhatsApp agent not found for phone number: ${cleanedPhoneNumber}`,
      );
    }

    return {
      cleanedPhoneNumber,
      userId: user.id,
      agentId,
    };
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
      const { agentId, userId } =
        await this.resolveAgentStorageContext(clientId);

      // Déterminer l'extension à partir du nom de fichier original
      const extension = originalFilename
        ? originalFilename.split('.').pop() || 'jpg'
        : 'jpg';

      // Construire le chemin dans Minio: {agentId}/catalog/images/{collectionId}/{userId}-{productId}-{index}.{ext}
      const objectKey = `${agentId}/catalog/images/${collectionId}/${userId}-${productId}-${imageIndex}.${extension}`;
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
      const { agentId } = await this.resolveAgentStorageContext(clientId);

      // Déterminer l'extension
      const extension = originalFilename
        ? originalFilename.split('.').pop() || 'jpg'
        : 'jpg';

      // Chemin: {agentId}/avatar.{ext}
      const objectKey = `${agentId}/avatar.${extension}`;
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
   * Supprime des images (de Minio et de la BD)
   */
  async deleteImages(
    imageIds: string[],
  ): Promise<{ success: boolean; deletedCount: number; error?: string }> {
    this.logger.log(
      `[START] Deleting ${imageIds.length} images from Minio and DB`,
    );

    if (!imageIds || imageIds.length === 0) {
      return { success: true, deletedCount: 0 };
    }

    try {
      // Récupérer les images depuis la BD pour obtenir leurs URLs
      this.logger.debug(`[DELETE-IMAGES] Fetching images from DB...`);
      const images = await this.prisma.productImage.findMany({
        where: {
          id: {
            in: imageIds,
          },
        },
        select: {
          id: true,
          url: true,
        },
      });

      this.logger.debug(
        `[DELETE-IMAGES] Found ${images.length} images to delete`,
      );

      // Supprimer les fichiers de Minio
      let deletedFromMinio = 0;
      for (const image of images) {
        try {
          // Extraire l'objectKey de l'URL
          // URL format: https://files-flemme.bedones.com/whatsapp-agent/<agentId>/catalog/images/...
          // On veut extraire: <agentId>/catalog/images/...
          const url = new URL(image.url);
          const pathParts = url.pathname.split('/');
          // Retirer le premier "/" et le bucket name
          const objectKey = pathParts.slice(2).join('/'); // Skip "", "whatsapp-agent"

          this.logger.debug(
            `[DELETE-IMAGES] Deleting from Minio: ${objectKey}`,
          );
          const deleted = await this.minioService.deleteFile(objectKey);
          if (deleted) {
            deletedFromMinio++;
          }
        } catch (error: unknown) {
          this.logger.error(
            `❌ [ERROR] Failed to delete image ${image.id} from Minio:`,
            error,
          );
          // Continue même si la suppression Minio échoue
        }
      }

      this.logger.log(
        `✅ Deleted ${deletedFromMinio}/${images.length} images from Minio`,
      );

      // Supprimer les entrées de la BD
      this.logger.debug(`[DELETE-IMAGES] Deleting from DB...`);
      const deleteResult = await this.prisma.productImage.deleteMany({
        where: {
          id: {
            in: imageIds,
          },
        },
      });

      this.logger.log(
        `✅ [END] Deleted ${deleteResult.count} images from DB (${deletedFromMinio} from Minio)`,
      );

      return {
        success: true,

        deletedCount: deleteResult.count,
      };
    } catch (error: unknown) {
      this.logger.error(`❌ [ERROR] Failed to delete images:`, error);
      return {
        success: false,
        deletedCount: 0,
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
      const uncategorizedProducts = catalogData.uncategorizedProducts || [];
      this.logger.log(
        `[CATALOG] Processing ${collections.length} collections and ${uncategorizedProducts.length} uncategorized products...`,
      );

      let collectionsCreated = 0;
      let collectionsUpdated = 0;
      let productsCreated = 0;
      let productsUpdated = 0;
      let imagesCreated = 0;

      // Récupérer toutes les collections existantes en une seule requête
      this.logger.debug(`[CATALOG] Fetching existing collections...`);
      const existingCollections = await this.prisma.collection.findMany({
        where: { user_id: user.id },
      });
      const collectionsMap = new Map(
        existingCollections.map((c) => [c.whatsapp_collection_id, c]),
      );

      // Récupérer tous les produits existants en une seule requête
      this.logger.debug(`[CATALOG] Fetching existing products...`);
      const existingProducts = await this.prisma.product.findMany({
        where: { user_id: user.id },
      });
      const productsMap = new Map(
        existingProducts.map((p) => [p.whatsapp_product_id, p]),
      );

      // Récupérer toutes les images existantes pour faire un diff incrémental
      this.logger.debug(`[CATALOG] Fetching existing product images...`);
      const existingImages = await this.prisma.productImage.findMany({
        where: {
          product: {
            user_id: user.id,
          },
        },
      });
      const imagesByProductId = new Map<string, typeof existingImages>();
      for (const image of existingImages) {
        const current = imagesByProductId.get(image.product_id);
        if (current) {
          current.push(image);
        } else {
          imagesByProductId.set(image.product_id, [image]);
        }
      }

      const normalizeUploadedImages = (uploadedImages: any[] = []) =>
        uploadedImages
          .map((imageData) => ({
            index: Number(imageData.index ?? 0),
            type: imageData.type || 'main',
            url: imageData.url,
            originalUrl: imageData.originalUrl || null,
            normalizedUrl: imageData.normalizedUrl || null,
            whatsappImageHash: imageData.whatsappImageHash || null,
          }))
          .filter((imageData) => Boolean(imageData.url));

      const getStoredImageIdentity = (image: {
        whatsapp_image_hash?: string | null;
        normalized_url?: string | null;
        original_url?: string | null;
        url: string;
      }) =>
        image.whatsapp_image_hash ||
        image.normalized_url ||
        image.original_url ||
        image.url;

      const getIncomingImageIdentity = (image: {
        whatsappImageHash?: string | null;
        normalizedUrl?: string | null;
        originalUrl?: string | null;
        url: string;
      }) =>
        image.whatsappImageHash ||
        image.normalizedUrl ||
        image.originalUrl ||
        image.url;

      const hasCoverChanged = (
        currentImages: Array<{
          whatsapp_image_hash?: string | null;
          normalized_url?: string | null;
          original_url?: string | null;
          url: string;
          image_index: number;
        }>,
        incomingImages: Array<{
          whatsappImageHash?: string | null;
          normalizedUrl?: string | null;
          originalUrl?: string | null;
          url: string;
          index: number;
        }>,
      ) => {
        const currentCover =
          currentImages.find((image) => image.image_index === 0) ||
          currentImages[0] ||
          null;
        const incomingCover =
          incomingImages.find((image) => image.index === 0) ||
          incomingImages[0] ||
          null;

        const currentKey = currentCover
          ? getStoredImageIdentity(currentCover)
          : null;
        const incomingKey = incomingCover
          ? getIncomingImageIdentity(incomingCover)
          : null;

        return currentKey !== incomingKey;
      };

      const syncProductImages = async (
        productId: string,
        incomingImages: Array<{
          index: number;
          type: string;
          url: string;
          originalUrl?: string | null;
          normalizedUrl?: string | null;
          whatsappImageHash?: string | null;
        }>,
      ) => {
        const currentImages = imagesByProductId.get(productId) || [];
        const coverChanged = hasCoverChanged(currentImages, incomingImages);
        const remainingCurrent = new Map(
          currentImages.map((image) => [image.id, image]),
        );
        let createdCount = 0;

        for (const incomingImage of incomingImages) {
          const matchedImage =
            (incomingImage.whatsappImageHash
              ? currentImages.find(
                  (image) =>
                    remainingCurrent.has(image.id) &&
                    image.whatsapp_image_hash ===
                      incomingImage.whatsappImageHash,
                )
              : undefined) ||
            (incomingImage.normalizedUrl
              ? currentImages.find(
                  (image) =>
                    remainingCurrent.has(image.id) &&
                    image.normalized_url === incomingImage.normalizedUrl,
                )
              : undefined) ||
            currentImages.find(
              (image) =>
                remainingCurrent.has(image.id) &&
                image.url === incomingImage.url,
            );

          if (matchedImage) {
            remainingCurrent.delete(matchedImage.id);

            const contentChanged =
              !!incomingImage.whatsappImageHash &&
              !!matchedImage.whatsapp_image_hash &&
              incomingImage.whatsappImageHash !==
                matchedImage.whatsapp_image_hash;
            const nextNeedsImageIndexing =
              matchedImage.needsImageIndexing || contentChanged;
            const shouldUpdateImage =
              matchedImage.url !== incomingImage.url ||
              (matchedImage.normalized_url || null) !==
                (incomingImage.normalizedUrl || null) ||
              matchedImage.image_type !== incomingImage.type ||
              matchedImage.image_index !== incomingImage.index ||
              (matchedImage.whatsapp_image_hash || null) !==
                (incomingImage.whatsappImageHash || null) ||
              matchedImage.needsImageIndexing !== nextNeedsImageIndexing;

            if (shouldUpdateImage) {
              await this.prisma.productImage.update({
                where: { id: matchedImage.id },
                data: {
                  url: incomingImage.url,
                  original_url: incomingImage.originalUrl || null,
                  normalized_url: incomingImage.normalizedUrl || null,
                  image_type: incomingImage.type,
                  image_index: incomingImage.index,
                  whatsapp_image_hash: incomingImage.whatsappImageHash || null,
                  needsImageIndexing: nextNeedsImageIndexing,
                },
              });
            }

            continue;
          }

          await this.prisma.productImage.create({
            data: {
              product_id: productId,
              url: incomingImage.url,
              original_url: incomingImage.originalUrl || null,
              normalized_url: incomingImage.normalizedUrl || null,
              image_type: incomingImage.type,
              image_index: incomingImage.index,
              whatsapp_image_hash: incomingImage.whatsappImageHash || null,
              needsImageIndexing: true,
            },
          });
          createdCount++;
        }

        if (remainingCurrent.size > 0) {
          await this.prisma.productImage.deleteMany({
            where: {
              id: {
                in: Array.from(remainingCurrent.keys()),
              },
            },
          });
        }

        const refreshedImages = await this.prisma.productImage.findMany({
          where: { product_id: productId },
        });
        imagesByProductId.set(productId, refreshedImages);

        return { createdCount, coverChanged };
      };

      const processProduct = async (
        productData: any,
        targetCollectionId: string | null,
      ) => {
        const whatsappProductId = productData.id;
        let product = productsMap.get(whatsappProductId);
        const normalizedPrice = normalizeWhatsAppPrice(productData.price);

        const productPayload: Prisma.ProductUpdateInput = {
          name: productData.name || 'Sans nom',
          description: productData.description || null,
          price: normalizedPrice,
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

        const incomingImages = normalizeUploadedImages(
          productData.uploadedImages,
        );
        const currentImages = product
          ? imagesByProductId.get(product.id) || []
          : [];
        const coverChanged = product
          ? hasCoverChanged(currentImages, incomingImages)
          : incomingImages.length > 0;
        const productTextChanged = product
          ? product.name !== productPayload.name ||
            (product.description || null) !==
              (productPayload.description || null) ||
            (product.price || null) !== (productPayload.price || null) ||
            (product.retailer_id || null) !==
              (productPayload.retailer_id || null) ||
            (product.category || null) !== (productPayload.category || null)
          : true;

        const shouldNeedTextIndexing =
          !product ||
          product.needsTextIndexing ||
          productTextChanged ||
          coverChanged;

        if (product) {
          product = await this.prisma.product.update({
            where: { id: product.id },
            data: {
              ...productPayload,
              needsTextIndexing: shouldNeedTextIndexing,
              coverImageDescription: coverChanged ? null : undefined,
              collection: targetCollectionId
                ? { connect: { id: targetCollectionId } }
                : { disconnect: true },
            },
          });
          productsUpdated++;
        } else {
          const createData: Prisma.ProductUncheckedCreateInput = {
            user_id: user.id,
            whatsapp_product_id: whatsappProductId,
            collection_id: targetCollectionId,
            name: productData.name || 'Sans nom',
            description: productData.description || null,
            coverImageDescription: null,
            needsTextIndexing: true,
            price: normalizedPrice,
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

        productsMap.set(whatsappProductId, product);

        const imageSyncResult = await syncProductImages(
          product.id,
          incomingImages,
        );
        imagesCreated += imageSyncResult.createdCount;
      };

      // Parcourir chaque collection
      for (const collectionData of collections) {
        const whatsappCollectionId = collectionData.id;
        this.logger.debug(
          `[CATALOG] Processing collection: ${collectionData.name} (${whatsappCollectionId})`,
        );

        // Vérifier si la collection existe dans la Map
        let collection = collectionsMap.get(whatsappCollectionId);

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
          await processProduct(productData, collection?.id || null);
        }
      }

      // Traiter les produits sans collection
      this.logger.debug(
        `[CATALOG] Processing ${uncategorizedProducts.length} uncategorized products`,
      );

      for (const productData of uncategorizedProducts) {
        await processProduct(productData, null);
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

  async getImageSyncStatus(userId: string) {
    return this.prisma.whatsAppAgent.findUnique({
      where: { userId },
      select: {
        syncImageStatus: true,
        lastImageSyncDate: true,
        lastImageSyncError: true,
      },
    });
  }

  /**
   * Force catalog synchronization for a user
   * Syncs both backend catalog (via connector) and whatsapp-agent local catalog
   */
  async forceCatalogSync(userId: string): Promise<{
    success: boolean;
    backendSync?: any;
    agentSync?: any;
    imageSync?: { queued: boolean; status: 'SYNCING' };
    error?: string;
  }> {
    try {
      this.logger.log(`🔄 Force catalog sync requested by user: ${userId}`);

      // Get user with whatsapp agent
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { whatsappAgent: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      if (!user.whatsappAgent) {
        throw new Error('WhatsApp agent not configured for this user');
      }

      const agent = user.whatsappAgent;

      // 1. Sync backend catalog (reuse synchronizeUserData)
      this.logger.log('📦 Syncing backend catalog via connector...');
      const backendSyncResult = await this.userSyncService.synchronizeUserData(
        user.phoneNumber,
      );

      // 2. Trigger whatsapp-agent local catalog sync
      this.logger.log('🧠 Triggering whatsapp-agent local catalog sync...');
      const agentUrl = `http://${agent.ipAddress}:${agent.port}`;
      const agentSyncResult = await this.whatsappAgentClient.triggerCatalogSync(
        agentUrl,
        agent.id,
      );

      // 3. Update backend timestamps / status.
      // Image indexing is now orchestrated by whatsapp-agent inside /catalog/sync.
      await this.prisma.whatsAppAgent.update({
        where: { id: agent.id },
        data: {
          lastCatalogSyncedAt: new Date(),
          syncImageStatus: 'SYNCING',
          lastImageSyncError: null,
        },
      });

      this.logger.log(
        `✅ Catalog sync completed for user ${userId} (${user.phoneNumber})`,
      );

      return {
        success: true,
        backendSync: backendSyncResult,
        agentSync: agentSyncResult,
        imageSync: {
          queued: agentSyncResult.imageSyncQueued ?? true,
          status: 'SYNCING',
        },
      };
    } catch (error: any) {
      await this.prisma.whatsAppAgent
        .update({
          where: { userId },
          data: {
            syncImageStatus: 'FAILED',
            lastImageSyncError: error.message,
          },
        })
        .catch(() => undefined);

      this.logger.error(
        `❌ Catalog sync failed: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Récupère le catalogue complet de l'utilisateur (collections + produits)
   */
  async getCatalog(userId: string) {
    try {
      this.logger.debug(`Fetching catalog for user: ${userId}`);

      // Récupérer les collections avec leurs produits et images
      const collections = await this.prisma.collection.findMany({
        where: { user_id: userId },
        include: {
          products: {
            include: {
              images: {
                orderBy: { image_index: 'asc' },
              },
              metadata: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
      });

      // Récupérer les produits sans collection
      const uncategorizedProducts = await this.prisma.product.findMany({
        where: {
          user_id: userId,
          collection_id: null,
        },
        include: {
          images: {
            orderBy: { image_index: 'asc' },
          },
          metadata: true,
        },
        orderBy: { created_at: 'desc' },
      });

      return {
        success: true,
        collections,
        uncategorizedProducts,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch catalog: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
