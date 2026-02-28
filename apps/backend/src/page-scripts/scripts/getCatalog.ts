/**
 * Script de récupération du catalogue WhatsApp
 * Ce script est exécuté dans le contexte de la page WhatsApp Web
 *
 * Variables injectées :
 * - BACKEND_URL: URL du backend
 * - TOKEN: Token JWT d'authentification (contient le clientId signé)
 * - INITIAL_ORIGINALS_URLS: JSON stringifié contenant la liste des images existantes [{id, original_url}]
 *
 * IMPORTANT: Le clientId n'est PAS une variable car il est extrait du token
 * côté backend pour des raisons de sécurité. Cela empêche un attaquant avec
 * un token volé de se faire passer pour un autre client.
 *
 */

/* eslint-disable no-undef, @typescript-eslint/no-floating-promises, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
// @ts-nocheck - Ce code s'exécute dans le navigateur, pas dans Node.js

(async () => {
  const BACKEND_URL = '{{BACKEND_URL}}';
  const TOKEN = '{{TOKEN}}';
  const INITIAL_ORIGINALS_URLS_RAW = '{{INITIAL_ORIGINALS_URLS}}';

  console.log('🔍 Démarrage de la récupération du catalogue...');

  /**
   * Normalise une URL WhatsApp en extrayant la partie stable (avant les query params)
   * Exemple: https://media.whatsapp.net/v/t45.5328-4/image.jpg?stp=... -> https://media.whatsapp.net/v/t45.5328-4/image.jpg
   */
  function normalizeWhatsAppUrl(url) {
    if (!url) return null;
    // Extraire la partie avant le '?' (enlever les query params dynamiques)
    const baseUrl = url.split('?')[0];
    return baseUrl;
  }

  /**
   * Génère un ID unique intemporel pour les noms de fichiers
   * Basé uniquement sur l'URL normalisée pour être déterministe
   */
  function generateUniqueId(normalizedUrl) {
    if (!normalizedUrl) return 'unknown';
    // Simple hash function basé uniquement sur l'URL normalisée
    let hash = 0;
    for (let i = 0; i < normalizedUrl.length; i++) {
      const char = normalizedUrl.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Extrait les produits d'un objet catalogue WPP (productCollection._index)
   */
  function extractProductsFromCatalog(catalog) {
    if (!catalog) return [];

    const productIndex = catalog.productCollection?._index;
    if (!productIndex || typeof productIndex !== 'object') return [];

    return Object.keys(productIndex)
      .map((productId) => productIndex[productId]?.attributes)
      .filter(Boolean);
  }

  /**
   * Sélectionne la meilleure URL image depuis un tableau [{key, value}]
   */
  function pickPreferredCdnUrl(imageEntries) {
    if (!Array.isArray(imageEntries)) return null;
    const full = imageEntries.find((entry) => entry?.key === 'full');
    if (full?.value) return full.value;
    const requested = imageEntries.find((entry) => entry?.key === 'requested');
    return requested?.value || null;
  }

  /**
   * Construit les URLs d'images d'un produit en supportant les 2 formats WPP
   */
  function buildProductImageUrls(product) {
    const imageUrls = [];
    const seenNormalizedUrls = new Set();
    const imageHashes = toImageHashes(product);

    const pushImage = (url, type, index, whatsappImageHash = null) => {
      if (!url) return;
      const normalizedUrl = normalizeWhatsAppUrl(url);
      if (!normalizedUrl || seenNormalizedUrls.has(normalizedUrl)) return;
      seenNormalizedUrls.add(normalizedUrl);
      imageUrls.push({
        url,
        normalizedUrl,
        type,
        index,
        whatsappImageHash: whatsappImageHash || null,
      });
    };

    const mainImageUrl =
      product.imageCdnUrl ||
      product.image_cdn_url ||
      pickPreferredCdnUrl(product.image_cdn_urls);
    pushImage(mainImageUrl, 'main', 0, imageHashes[0] || null);

    if (Array.isArray(product.additionalImageCdnUrl)) {
      product.additionalImageCdnUrl.forEach((url, index) => {
        pushImage(url, 'additional', index + 1, imageHashes[index + 1] || null);
      });
    } else if (Array.isArray(product.additional_image_cdn_urls)) {
      product.additional_image_cdn_urls.forEach((imageVariants, index) => {
        const url = pickPreferredCdnUrl(imageVariants);
        pushImage(url, 'additional', index + 1, imageHashes[index + 1] || null);
      });
    }

    return imageUrls;
  }

  function toPriceAmount1000(product) {
    const raw =
      product.priceAmount1000 ??
      product.price_amount_1000 ??
      product.price ??
      null;
    if (raw === null || raw === undefined) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function toImageHashes(product) {
    if (Array.isArray(product.image_hashes_for_whatsapp)) {
      return product.image_hashes_for_whatsapp.filter(Boolean);
    }

    const hashes = [];
    if (product.imageHash) hashes.push(product.imageHash);
    if (Array.isArray(product.additionalImageHashes)) {
      hashes.push(...product.additionalImageHashes.filter(Boolean));
    }
    return hashes;
  }

  // Parser la liste des images existantes
  let initialOriginalsUrls = [];
  try {
    if (
      INITIAL_ORIGINALS_URLS_RAW &&
      INITIAL_ORIGINALS_URLS_RAW !== '[]' &&
      INITIAL_ORIGINALS_URLS_RAW !== ''
    ) {
      initialOriginalsUrls = JSON.parse(INITIAL_ORIGINALS_URLS_RAW);
      console.log(
        `📋 ${initialOriginalsUrls.length} images existantes détectées dans le cache`,
      );
      console.log('📋 URLs normalisées en cache:');
      initialOriginalsUrls.forEach((img, index) => {
        console.log(`   ${index + 1}. ${img.normalized_url}`);
      });
    } else {
      console.log('📋 Première synchronisation - aucune image existante');
    }
  } catch (e) {
    console.error('❌ Erreur parsing initialOriginalsUrls:', e);
    initialOriginalsUrls = [];
  }

  try {
    // Récupérer l'ID de l'utilisateur
    const userId = window.WPP.conn?.getMyUserId()?._serialized || '';

    if (!userId) {
      throw new Error('User ID not found');
    }

    console.log(
      '📦 Récupération du catalogue complet (queryCatalog + CatalogStore)...',
    );

    const productsById = new Map();

    const addProduct = (rawProduct) => {
      const product = rawProduct?.attributes || rawProduct;
      if (!product?.id) return;
      if (!productsById.has(product.id)) {
        productsById.set(product.id, product);
      }
    };

    let queryCatalogCount = 0;
    let catalogStoreCount = 0;
    let legacyCatalogCount = 0;

    // 1) queryCatalog paginé (produits visibles)
    if (window.WPP.whatsapp?.functions?.queryCatalog) {
      try {
        let afterToken = undefined;
        while (true) {
          const response = await window.WPP.whatsapp.functions.queryCatalog(
            userId,
            afterToken,
          );
          const pageProducts = Array.isArray(response?.data)
            ? response.data
            : [];
          queryCatalogCount += pageProducts.length;
          for (const product of pageProducts) {
            addProduct(product);
          }

          const nextAfter = response?.paging?.cursors?.after;
          if (!nextAfter || nextAfter === afterToken) {
            break;
          }
          afterToken = nextAfter;
        }
      } catch (error) {
        console.warn(
          '⚠️ queryCatalog indisponible, fallback sur autres sources:',
          error,
        );
      }
    }

    // 2) CatalogStore.findQuery (complément pour produits manquants/cachés)
    if (window.WPP.whatsapp?.CatalogStore?.findQuery) {
      try {
        const catalogStoreResults =
          await window.WPP.whatsapp.CatalogStore.findQuery(userId);

        if (Array.isArray(catalogStoreResults)) {
          for (const entry of catalogStoreResults) {
            const entryProducts = extractProductsFromCatalog(entry);
            catalogStoreCount += entryProducts.length;
            for (const product of entryProducts) {
              addProduct(product);
            }
          }
        }
      } catch (error) {
        console.warn(
          '⚠️ CatalogStore.findQuery indisponible, fallback getMyCatalog:',
          error,
        );
      }
    }

    // 3) Fallback historique
    try {
      const catalog = await window.WPP.catalog.getMyCatalog();
      const fallbackProducts = extractProductsFromCatalog(catalog);
      legacyCatalogCount = fallbackProducts.length;
      for (const product of fallbackProducts) {
        addProduct(product);
      }
    } catch (error) {
      console.warn('⚠️ getMyCatalog indisponible:', error);
    }

    if (productsById.size === 0) {
      throw new Error('Catalogue non disponible');
    }

    console.log(
      `✅ Produits récupérés - queryCatalog: ${queryCatalogCount}, CatalogStore: ${catalogStoreCount}, getMyCatalog: ${legacyCatalogCount}, uniques: ${productsById.size}`,
    );

    // Récupérer les collections pour mapper les produits
    const collections = await window.WPP.catalog.getCollections(
      userId,
      50,
      100,
    );
    console.log(`✅ ${collections?.length || 0} collections récupérées`);

    // Créer un Map pour associer produit ID -> collection
    const productToCollectionMap = new Map();
    for (const collection of collections) {
      for (const product of collection.products || []) {
        productToCollectionMap.set(product.id, {
          id: collection.id,
          name: collection.name,
        });
      }
    }

    // Traiter tous les produits pour télécharger les images
    const processedCollections = [];
    const processedUncategorizedProducts = [];
    let totalImages = 0;
    let skippedImages = 0;

    // Collecter toutes les URLs du catalogue actuel
    const currentCatalogUrls = new Set();

    // Traiter chaque produit
    for (const product of productsById.values()) {
      try {
        const productId = product.id;
        const imageUrls = buildProductImageUrls(product);

        // Télécharger et envoyer chaque image au backend
        const uploadedImages = [];

        for (const imageInfo of imageUrls) {
          try {
            // Ajouter l'URL normalisée au catalogue actuel (pour la détection des images obsolètes)
            currentCatalogUrls.add(imageInfo.normalizedUrl);

            // Vérifier si l'image existe déjà en comparant les URLs normalisées
            const existingImage = initialOriginalsUrls.find(
              (img) => img.normalized_url === imageInfo.normalizedUrl,
            );

            if (existingImage) {
              // L'image existe déjà, on skip l'upload
              console.log(
                `⏭️ Image ${imageInfo.index} du produit ${productId} déjà uploadée (skip)`,
              );
              console.log(`   URL Minio existante: ${existingImage.url}`);
              console.log(`   URL normalisée: ${existingImage.normalized_url}`);

              uploadedImages.push({
                index: imageInfo.index,
                type: imageInfo.type,
                url: existingImage.url, // URL Minio existante
                originalUrl: imageInfo.url,
                normalizedUrl: imageInfo.normalizedUrl,
                whatsappImageHash: imageInfo.whatsappImageHash,
              });
              skippedImages++;
              continue;
            }

            // Télécharger l'image dans le navigateur
            console.log(
              `📥 Téléchargement image ${imageInfo.index} du produit ${productId}`,
            );
            console.log(`   URL originale: ${imageInfo.url}`);
            console.log(`   URL normalisée: ${imageInfo.normalizedUrl}`);

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
                `❌ Erreur HTTP ${response.status} pour ${productId} image ${imageInfo.index}`,
              );
              console.error(`   URL: ${imageInfo.url}`);
              continue;
            }

            const blob = await response.blob();

            if (blob.size === 0) {
              console.error(
                `❌ Blob vide pour ${productId} image ${imageInfo.index}`,
              );
              continue;
            }

            // Convertir le blob en base64 pour l'envoyer via nodeFetch
            const reader = new FileReader();
            const base64Promise = new Promise((resolve) => {
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(blob);
            });
            const base64Data = await base64Promise;

            // Générer un ID unique intemporel basé sur l'URL normalisée
            const uniqueId = generateUniqueId(imageInfo.normalizedUrl);

            // Déterminer l'ID de collection (peut être null)
            const collectionInfo = productToCollectionMap.get(productId);
            const collectionId = collectionInfo
              ? collectionInfo.id
              : 'uncategorized';

            // Envoyer l'image au backend via nodeFetch (contourne la CSP)
            // Note: clientId n'est PAS envoyé pour des raisons de sécurité
            // Il est extrait du token JWT par le backend
            const uploadResponse = await window.nodeFetch(
              `${BACKEND_URL}/catalog/upload-image`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${TOKEN}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  image: base64Data,
                  filename: `${productId}-${imageInfo.index}-${uniqueId}.jpg`,
                  productId: productId,
                  collectionId: collectionId,
                  imageIndex: imageInfo.index.toString(),
                  imageType: imageInfo.type,
                  originalUrl: imageInfo.url,
                  normalizedUrl: imageInfo.normalizedUrl,
                }),
              },
            );

            if (uploadResponse.ok) {
              const uploadResult = await uploadResponse.json();
              const minioUrl = uploadResult.data?.url || uploadResult.url;

              uploadedImages.push({
                index: imageInfo.index,
                type: imageInfo.type,
                url: minioUrl, // URL Minio retournée par le backend
                originalUrl: imageInfo.url,
                normalizedUrl: imageInfo.normalizedUrl,
                whatsappImageHash: imageInfo.whatsappImageHash,
              });
              totalImages++;
              console.log(
                `✅ Image ${imageInfo.index} du produit ${productId} uploadée`,
              );
              console.log(`   URL WhatsApp: ${imageInfo.url}`);
              console.log(`   URL Minio: ${minioUrl}`);
            } else {
              const errorText = await uploadResponse.text();
              console.error(
                `❌ Erreur upload image ${imageInfo.index} du produit ${productId}`,
              );
              console.error(`   Status: ${uploadResponse.status}`);
              console.error(`   Erreur: ${errorText}`);
            }
          } catch (imgError: any) {
            console.error(
              `❌ Erreur traitement image ${imageInfo.index} du produit ${productId}:`,
              imgError.message,
            );
          }
        }

        // Ajouter le produit avec ses images uploadées et convertir le prix
        const priceAmount1000 = toPriceAmount1000(product);
        const processedProduct = {
          id: productId,
          name: product.name,
          description: product.description,
          price: priceAmount1000 !== null ? priceAmount1000 / 1000 : null,
          currency: product.currency,
          availability: product.availability,
          retailer_id: product.retailerId || product.retailer_id || null,
          max_available: product.maxAvailable ?? product.max_available ?? null,
          is_hidden: !!(product.isHidden || product.is_hidden),
          is_sanctioned: !!(product.isSanctioned || product.is_sanctioned),
          checkmark: product.checkmark || false,
          url: product.url || null,
          whatsapp_product_can_appeal: !!(
            product.canAppeal || product.whatsapp_product_can_appeal
          ),
          image_hashes_for_whatsapp: toImageHashes(product),
          videos: Array.isArray(product.videos) ? product.videos : [],
          uploadedImages,
        };

        // Déterminer si le produit appartient à une collection
        const collectionInfo = productToCollectionMap.get(productId);
        if (collectionInfo) {
          // Produit dans une collection
          // Trouver ou créer la collection dans processedCollections
          let collection = processedCollections.find(
            (c) => c.id === collectionInfo.id,
          );
          if (!collection) {
            collection = {
              id: collectionInfo.id,
              name: collectionInfo.name,
              products: [],
            };
            processedCollections.push(collection);
          }
          collection.products.push(processedProduct);
        } else {
          // Produit sans collection
          processedUncategorizedProducts.push(processedProduct);
        }
      } catch (productError: any) {
        console.error(
          `❌ Erreur traitement produit ${product?.id || 'unknown'}:`,
          productError.message,
        );
        // Skip le produit en cas d'erreur
      }
    }

    console.log(
      `✅ Traitement terminé - ${totalImages} nouvelles images, ${skippedImages} images existantes`,
    );

    // Déterminer les images à supprimer (présentes dans initialOriginalsUrls mais pas dans currentCatalogUrls)
    // IMPORTANT: Ne supprimer que si initialOriginalsUrls n'est pas vide (sinon c'est l'initialisation)
    // Note: currentCatalogUrls contient maintenant les URLs normalisées
    const imagesToDelete = [];
    if (initialOriginalsUrls.length > 0) {
      for (const existingImage of initialOriginalsUrls) {
        // Comparer avec normalized_url (qui est maintenant dans currentCatalogUrls)
        if (!currentCatalogUrls.has(existingImage.normalized_url)) {
          imagesToDelete.push(existingImage.id);
        }
      }

      if (imagesToDelete.length > 0) {
        console.log(
          `🗑️ ${imagesToDelete.length} images obsolètes à supprimer...`,
        );

        // Appeler l'endpoint de suppression
        try {
          const deleteResponse = await window.nodeFetch(
            `${BACKEND_URL}/catalog/delete-images`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${TOKEN}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                imageIds: imagesToDelete,
              }),
            },
          );

          if (deleteResponse.ok) {
            const deleteResult = await deleteResponse.json();
            console.log(
              `✅ Images obsolètes supprimées:`,
              deleteResult.deletedCount,
            );
          } else {
            console.error(
              `❌ Erreur lors de la suppression des images obsolètes`,
            );
          }
        } catch (deleteError: any) {
          console.error(
            `❌ Erreur appel endpoint delete-images:`,
            deleteError.message,
          );
        }
      } else {
        console.log(`✅ Aucune image obsolète à supprimer`);
      }
    }

    // Envoyer les données complètes du catalogue au backend pour sauvegarde en BD (via nodeFetch)
    console.log('💾 Envoi des données du catalogue au backend...');
    console.log(
      `📊 ${processedCollections.length} collections, ${processedUncategorizedProducts.length} produits sans collection`,
    );

    const catalogSaveResponse = await window.nodeFetch(
      `${BACKEND_URL}/catalog/save-catalog`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          collections: processedCollections,
          uncategorizedProducts: processedUncategorizedProducts,
        }),
      },
    );

    if (catalogSaveResponse.ok) {
      const saveResult = await catalogSaveResponse.json();
      console.log(
        '✅ Catalogue sauvegardé en base de données:',
        saveResult.stats,
      );
      const totalProductsCount =
        processedCollections.reduce(
          (acc, col) => acc + (col.products?.length || 0),
          0,
        ) + processedUncategorizedProducts.length;

      return {
        success: true,
        collections: processedCollections,
        stats: {
          collectionsCount: processedCollections.length,
          productsCount: totalProductsCount,
          imagesCount: totalImages,
        },
        dbStats: saveResult.stats,
      };
    } else {
      console.error('❌ Erreur lors de la sauvegarde du catalogue en BD');
      const totalProductsCount =
        processedCollections.reduce(
          (acc, col) => acc + (col.products?.length || 0),
          0,
        ) + processedUncategorizedProducts.length;
      return {
        success: true, // Les images sont uploadées même si la sauvegarde en BD échoue
        collections: processedCollections,
        stats: {
          collectionsCount: processedCollections.length,
          productsCount: totalProductsCount,
          imagesCount: totalImages,
        },
        warning: 'Catalog data not saved to database',
      };
    }
  } catch (error: any) {
    console.error('❌ Erreur récupération catalogue:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack,
    };
  }
})();
