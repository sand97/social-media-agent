/**
 * Send multiple catalog products to a chat
 * Executed in WhatsApp Web context
 *
 * Variables:
 * - TO: Recipient chat ID (format: 123456789@c.us)
 * - PRODUCT_IDS: Comma-separated product IDs
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
    const chatId = '{{TO}}';
    const rawProductIds = '{{PRODUCT_IDS}}';

    if (!chatId || chatId.includes('{{')) {
      throw new Error('TO is required');
    }

    if (!rawProductIds || rawProductIds.includes('{{')) {
      throw new Error('PRODUCT_IDS is required');
    }

    const productIds = rawProductIds
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (productIds.length === 0) {
      throw new Error('PRODUCT_IDS must include at least one id');
    }

    // ========== HELPER FUNCTIONS ==========

    /**
     * Normalise une URL WhatsApp en extrayant la partie stable (avant les query params)
     * Exemple: https://media.whatsapp.net/v/t45.5328-4/image.jpg?stp=...
     * -> https://media.whatsapp.net/v/t45.5328-4/image.jpg
     */
    function normalizeWhatsAppUrl(url) {
      if (!url) return null;
      const baseUrl = url.split('?')[0];
      return baseUrl;
    }

    /**
     * Récupère les données d'image en cache depuis localStorage
     * Cache structure: { productId: { normalized_url, messageId, uploadedAt, mediaData } }
     */
    function getCachedImageData(productId, normalizedUrl) {
      try {
        const cacheKey = 'bedones_product_images_cache';
        const cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
        const cached = cache[productId];

        if (!cached) return null;

        // Vérifier que le normalized_url correspond
        if (cached.normalized_url !== normalizedUrl) {
          console.log(
            `[cache] URL changed for product ${productId}, cache invalidated`,
          );
          return null;
        }

        // Vérifier que le cache n'est pas trop vieux (7 jours)
        const now = Date.now();
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 jours
        if (now - cached.uploadedAt > maxAge) {
          console.log(`[cache] Cache expired for product ${productId}`);
          return null;
        }

        console.log(`[cache] Hit for product ${productId}`);
        return cached;
      } catch (error) {
        console.warn('[cache] Error reading cache:', error);
        return null;
      }
    }

    /**
     * Sauvegarde les données d'image dans le cache localStorage
     */
    function setCachedImageData(
      productId,
      normalizedUrl,
      messageId,
      mediaData,
    ) {
      try {
        const cacheKey = 'bedones_product_images_cache';
        const cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');

        cache[productId] = {
          normalized_url: normalizedUrl,
          messageId: messageId,
          uploadedAt: Date.now(),
          mediaData: mediaData,
        };

        localStorage.setItem(cacheKey, JSON.stringify(cache));
        console.log(`[cache] Saved for product ${productId}`);
      } catch (error) {
        console.warn('[cache] Error saving cache:', error);
      }
    }

    /**
     * Nettoie les entrées de cache trop anciennes pour économiser de l'espace
     */
    function cleanupOldCache() {
      try {
        const cacheKey = 'bedones_product_images_cache';
        const cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
        const now = Date.now();
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 jours

        let cleaned = 0;
        for (const productId in cache) {
          if (now - cache[productId].uploadedAt > maxAge) {
            delete cache[productId];
            cleaned++;
          }
        }

        if (cleaned > 0) {
          localStorage.setItem(cacheKey, JSON.stringify(cache));
          console.log(`[cache] Cleaned ${cleaned} old entries`);
        }
      } catch (error) {
        console.warn('[cache] Error cleaning cache:', error);
      }
    }

    /**
     * Vérifie si le groupe technique existe, sinon le crée et l'archive
     * @returns {Promise<string>} ID du groupe technique
     */
    async function ensureTechnicalGroupExists(fail: boolean) {
      try {
        const groupName = '[Bedones] technical';

        // Lister tous les groupes
        const allChats = await window.WPP.chat.list({ onlyGroups: true });

        // Chercher le groupe technique
        const existingGroup = allChats.find(
          (chat) =>
            chat.name === groupName || chat.formattedTitle === groupName,
        );

        if (existingGroup) {
          console.log(`[technical-group] Found existing group:`, existingGroup);
          const groupId = existingGroup.id._serialized;
          if (!existingGroup.attributes?.archive) {
            await WPP.chat.archive(groupId);
            console.log(`[technical-group] Group archived: ${groupId}`);
          }
          return groupId;
        } else if (fail) {
          throw new Error('Unable to create group');
        }

        // Créer le groupe (vide, juste avec l'utilisateur actuel)
        console.log(`[technical-group] Creating new group: ${groupName}`);
        try {
          await window.WPP.group.create(groupName, [
            window.WPP.whatsapp.UserPrefs.getMaybeMeUser(),
          ]);
        } catch (e) {}
        ensureTechnicalGroupExists(true);
        // const groupId = newGroup.gid._serialized;
        //
        // console.log(`[technical-group] Group created: ${groupId}`);
        //
        // // Archiver le groupe pour qu'il ne soit pas visible
        //
        // return groupId;
      } catch (error) {
        console.error('[technical-group] Error ensuring group exists:', error);
        throw new Error(
          `Failed to create/find technical group: ${error.message}`,
        );
      }
    }

    /**
     * Génère une thumbnail redimensionnée à partir d'un dataUrl
     * @param {string} dataUrl - DataUrl de l'image originale
     * @param {number} maxWidth - Largeur maximale (default: 600)
     * @param {number} maxHeight - Hauteur maximale (default: 600)
     * @returns {Promise<string>} DataUrl de la thumbnail
     */
    async function generateThumbnail(dataUrl, maxWidth = 600, maxHeight = 600) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          try {
            // Calculer les nouvelles dimensions en gardant le ratio
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
              }
            } else {
              if (height > maxHeight) {
                width = (width * maxHeight) / height;
                height = maxHeight;
              }
            }

            // Créer un canvas pour redimensionner
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Convertir en dataUrl avec qualité JPEG
            const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.85);
            resolve(thumbnailDataUrl);
          } catch (error) {
            reject(error);
          }
        };

        img.onerror = (error) => {
          reject(new Error('Failed to load image for thumbnail generation'));
        };

        img.src = dataUrl;
      });
    }

    /**
     * Extrait les métadonnées média d'un message
     */
    function extractMedia(msg) {
      const md = msg && msg.mediaData ? msg.mediaData : msg;
      return {
        directPath: (md && md.directPath) || msg.directPath,
        mediaKey: (md && md.mediaKey) || msg.mediaKey,
        encFilehash: (md && md.encFilehash) || msg.encFilehash,
        filehash: (md && md.filehash) || msg.filehash,
        size: (md && md.size) || msg.size,
        mimetype: (md && md.mimetype) || msg.mimetype,
        mediaKeyTimestamp:
          (md && md.mediaKeyTimestamp) || msg.mediaKeyTimestamp,
        width: (md && (md.fullWidth || md.width)) || msg.width || msg.fullWidth,
        height:
          (md && (md.fullHeight || md.height)) || msg.height || msg.fullHeight,
      };
    }

    /**
     * Attend que les métadonnées média soient disponibles après upload
     */
    async function waitForMediaFields(id) {
      for (let i = 0; i < 10; i++) {
        const msg = await WPP.chat.getMessageById(id);
        const fields = extractMedia(msg);
        if (
          fields.directPath &&
          fields.mediaKey &&
          fields.encFilehash &&
          fields.size
        ) {
          return { msg, fields };
        }
        await new Promise(function (r) {
          setTimeout(r, 500);
        });
      }
      throw new Error('media fields still missing after upload');
    }

    /**
     * Upload une image de produit dans le groupe technique avec cache
     * @param {string} technicalGroupId - ID du groupe technique
     * @param {string} productId - ID du produit
     * @param {object} product - Objet produit WPP
     * @returns {Promise<{productId, imageUrl, normalizedUrl, mediaData}>}
     */
    async function uploadProductImage(technicalGroupId, productId, product) {
      try {
        const imageUrl =
          product.imageCdnUrl ||
          (product.attributes && product.attributes.imageCdnUrl);

        if (!imageUrl) {
          throw new Error(`imageUrl missing for product ${productId}`);
        }

        const normalizedUrl = normalizeWhatsAppUrl(imageUrl);
        console.log(
          `[upload] Product ${productId} - normalized URL: ${normalizedUrl}`,
        );

        // Vérifier le cache
        const cached = getCachedImageData(productId, normalizedUrl);
        if (cached && cached.mediaData && cached.mediaData.thumbnailDataUrl) {
          console.log(`[upload] Using cached data for product ${productId}`);
          return {
            productId,
            imageUrl,
            normalizedUrl,
            mediaData: cached.mediaData,
            fromCache: true,
          };
        }

        // Si cache invalide ou sans thumbnail, on régénère
        if (cached && !cached.mediaData.thumbnailDataUrl) {
          console.log(
            `[upload] Cache exists but no thumbnail for product ${productId}, regenerating...`,
          );
        }

        // Télécharger l'image
        console.log(`[upload] Downloading image for product ${productId}`);
        const download = await WPP.util.downloadImage(imageUrl);
        const dataUrl = download.data;

        if (!dataUrl) {
          throw new Error(`Failed to download image for product ${productId}`);
        }

        // Générer la thumbnail
        console.log(`[upload] Generating thumbnail for product ${productId}`);
        const thumbnailDataUrl = await generateThumbnail(dataUrl, 100, 100);

        // Uploader dans le groupe technique
        console.log(
          `[upload] Uploading to technical group for product ${productId}`,
        );
        const imgSend = await WPP.chat.sendFileMessage(
          technicalGroupId,
          dataUrl,
          {
            type: 'image',
            caption: productId, // Utiliser le productId comme caption pour identification
            waitForAck: true,
          },
        );

        console.log(
          `[upload] Image sent for product ${productId}, messageId: ${imgSend.id}`,
        );

        // Attendre les métadonnées d'upload
        const media = await waitForMediaFields(imgSend.id);
        console.log(`[upload] Media fields retrieved for product ${productId}`);

        const mediaData = {
          ...media.fields,
          thumbnailDataUrl, // Thumbnail redimensionnée pour le body du message produit
        };

        // Sauvegarder dans le cache
        setCachedImageData(productId, normalizedUrl, imgSend.id, mediaData);

        return {
          productId,
          imageUrl,
          normalizedUrl,
          mediaData,
          fromCache: false,
        };
      } catch (error) {
        console.error(
          `[upload] Error uploading image for product ${productId}:`,
          error,
        );
        throw error;
      }
    }

    /**
     * Upload toutes les images nécessaires en parallèle avec cache
     * @param {string} technicalGroupId - ID du groupe technique
     * @param {Array<string>} productIds - Liste des IDs produits
     * @param {string} userId - ID de l'utilisateur
     * @returns {Promise<Map<productId, uploadResult>>}
     */
    async function ensureFilesAreUploaded(
      technicalGroupId,
      productIds,
      userId,
    ) {
      console.log(
        `[ensureFiles] Starting upload for ${productIds.length} products`,
      );

      // Récupérer le catalogue une seule fois
      const [catalog] =
        await window.WPP.whatsapp.CatalogStore.findQuery(userId);

      // Créer les promesses d'upload pour chaque produit
      const uploadPromises = productIds.map(async (productId) => {
        const product =
          catalog && catalog.productCollection && catalog.productCollection.get
            ? catalog.productCollection.get(productId)
            : null;

        if (!product) {
          console.warn(
            `[ensureFiles] Product ${productId} not found in catalog`,
          );
          return { productId, error: 'product not found', product: null };
        }

        try {
          const uploadResult = await uploadProductImage(
            technicalGroupId,
            productId,
            product,
          );
          return {
            ...uploadResult,
            product,
          };
        } catch (error) {
          console.error(
            `[ensureFiles] Failed to upload product ${productId}:`,
            error,
          );
          return {
            productId,
            error: error.message,
            product,
          };
        }
      });

      // Exécuter tous les uploads en parallèle
      const uploadResults = await Promise.all(uploadPromises);

      // Créer un Map pour accès facile
      const resultsMap = new Map();
      for (const result of uploadResults) {
        resultsMap.set(result.productId, result);
      }

      const successful = uploadResults.filter((r) => !r.error).length;
      const fromCache = uploadResults.filter((r) => r.fromCache).length;
      console.log(
        `[ensureFiles] Upload complete: ${successful}/${productIds.length} successful, ${fromCache} from cache`,
      );

      return resultsMap;
    }

    // ========== MAIN FLOW ==========

    const sendSingleProduct = async (chatId, productId, uploadedData) => {
      console.log('[product] start', {
        chatId,
        productId,
        fromCache: uploadedData.fromCache,
      });

      if (uploadedData.error) {
        throw new Error(`Upload failed: ${uploadedData.error}`);
      }

      const product = uploadedData.product;
      const mediaData = uploadedData.mediaData;

      const me = WPP.whatsapp.UserPrefs.getMaybeMePnUser();
      const owner = product.catalogWid || me;
      const businessOwnerJid =
        owner && owner.toJid
          ? owner.toJid()
          : owner
            ? owner.toString().replace('@c.us', '@s.whatsapp.net')
            : null;

      // Extraire le body base64 de la thumbnail
      const body = mediaData.thumbnailDataUrl.split(',', 2)[1];

      const raw = {
        type: 'product',
        body: body,
        productId: product.id ? product.id.toString() : String(productId),
        businessOwnerJid: businessOwnerJid,
        title: product.name,
        description: product.description || '',
        currencyCode: product.currency || null,
        priceAmount1000: product.priceAmount1000 || null,
        salePriceAmount1000: product.salePriceAmount1000 || null,
        url: product.url || '',
        productImageCount: product.imageCount || 1,

        mimetype: mediaData.mimetype,
        filehash: mediaData.filehash,
        encFilehash: mediaData.encFilehash,
        size: mediaData.size,
        mediaKey: mediaData.mediaKey,
        mediaKeyTimestamp: mediaData.mediaKeyTimestamp,
        directPath: mediaData.directPath,
        width: mediaData.width,
        height: mediaData.height,
      };

      console.log('[product] rawMessage', raw);

      const result = await WPP.chat.sendRawMessage(chatId, raw);
      console.log('[product] send result', result);

      // Pas de cleanup - les images restent dans le groupe technique archivé

      return {
        success: true,
        to: chatId,
        productId: productId,
        fromCache: uploadedData.fromCache,
        ...result,
      };
    };

    // Nettoyer les vieilles entrées du cache
    cleanupOldCache();

    // 1. S'assurer que le groupe technique existe
    const technicalGroupId = await ensureTechnicalGroupExists();
    console.log(`[main] Using technical group: ${technicalGroupId}`);

    // 2. Récupérer l'ID utilisateur
    const userId = WPP.whatsapp.UserPrefs.getMaybeMePnUser()._serialized;

    // 3. Uploader toutes les images nécessaires en parallèle (avec cache)
    const uploadedDataMap = await ensureFilesAreUploaded(
      technicalGroupId,
      productIds,
      userId,
    );

    // 4. Envoyer les messages produits
    const results = [];

    for (const productId of productIds) {
      const uploadedData = uploadedDataMap.get(productId);
      if (!uploadedData) {
        console.error(`[main] No upload data for product ${productId}`);
        results.push({
          success: false,
          productId,
          error: 'No upload data',
        });
        continue;
      }

      try {
        const result = await sendSingleProduct(chatId, productId, uploadedData);
        results.push(result);
      } catch (error) {
        console.error(`[main] Failed to send product ${productId}:`, error);
        results.push({
          success: false,
          productId,
          error: error.message,
        });
      }
    }

    return {
      success: true,
      count: results.length,
      results,
    };
  } catch (error) {
    console.error('Failed to send product message:', error);
    return {
      success: false,
      error: error.message,
    };
  }
})();
