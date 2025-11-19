/**
 * Script de récupération du catalogue WhatsApp
 * Ce script est exécuté dans le contexte de la page WhatsApp Web
 *
 * Variables injectées :
 * - BACKEND_URL: URL du backend
 * - TOKEN: Token JWT d'authentification (contient le clientId signé)
 *
 * IMPORTANT: Le clientId n'est PAS une variable car il est extrait du token
 * côté backend pour des raisons de sécurité. Cela empêche un attaquant avec
 * un token volé de se faire passer pour un autre client.
 *
 */

/* eslint-disable no-undef */
// @ts-nocheck - Ce code s'exécute dans le navigateur, pas dans Node.js

(async () => {
  const BACKEND_URL = '{{BACKEND_URL}}';
  const TOKEN = '{{TOKEN}}';

  console.log('🔍 Démarrage de la récupération du catalogue...');

  try {
    // Récupérer l'ID de l'utilisateur
    const userId = window.WPP.conn?.getMyUserId()?._serialized || '';

    if (!userId) {
      throw new Error('User ID not found');
    }

    console.log('📦 Récupération des collections...');

    // Récupérer les collections avec leurs produits
    const collections = await window.WPP.catalog.getCollections(
      userId,
      50,
      100,
    );

    console.log(`✅ ${collections?.length || 0} collections récupérées`);

    // Traiter chaque collection et produit pour télécharger les images
    const processedCollections = [];
    let totalImages = 0;

    for (const collection of collections) {
      const processedProducts = [];

      // Traiter chaque produit de la collection
      for (const product of collection.products || []) {
        try {
          const imageUrls: Array<{ url: string; type: string; index: number }> =
            [];

          // 1. Image principale
          if (product.image_cdn_urls && Array.isArray(product.image_cdn_urls)) {
            const fullImage = product.image_cdn_urls.find(
              (img) => img.key === 'full',
            );
            if (fullImage?.value) {
              imageUrls.push({
                url: fullImage.value,
                type: 'main',
                index: 0,
              });
            }
          }

          // 2. Images additionnelles
          if (
            product.additional_image_cdn_urls &&
            Array.isArray(product.additional_image_cdn_urls)
          ) {
            product.additional_image_cdn_urls.forEach(
              (imgArray: any, index: number) => {
                if (Array.isArray(imgArray)) {
                  const fullImage = imgArray.find((img) => img.key === 'full');
                  if (fullImage?.value) {
                    imageUrls.push({
                      url: fullImage.value,
                      type: 'additional',
                      index: index + 1,
                    });
                  }
                }
              },
            );
          }

          // Télécharger et envoyer chaque image au backend
          const uploadedImages = [];

          for (const imageInfo of imageUrls) {
            try {
              // Télécharger l'image dans le navigateur
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
                  `❌ Erreur HTTP ${response.status} pour ${product.id} image ${imageInfo.index}`,
                );
                continue;
              }

              const blob = await response.blob();

              if (blob.size === 0) {
                console.error(
                  `❌ Blob vide pour ${product.id} image ${imageInfo.index}`,
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
                    filename: `${product.id}-${imageInfo.index}.jpg`,
                    productId: product.id,
                    collectionId: collection.id,
                    imageIndex: imageInfo.index.toString(),
                    imageType: imageInfo.type,
                    originalUrl: imageInfo.url,
                  }),
                },
              );

              if (uploadResponse.ok) {
                const uploadResult = await uploadResponse.json();
                uploadedImages.push({
                  index: imageInfo.index,
                  type: imageInfo.type,
                  url: uploadResult.data?.url || uploadResult.url, // URL Minio retournée par le backend
                  originalUrl: imageInfo.url,
                });
                totalImages++;
                console.log(
                  `✅ Image ${imageInfo.index} du produit ${product.id} uploadée`,
                );
              } else {
                console.error(
                  `❌ Erreur upload image ${imageInfo.index} du produit ${product.id}`,
                );
              }
            } catch (imgError: any) {
              console.error(
                `❌ Erreur traitement image ${imageInfo.index} du produit ${product.id}:`,
                imgError.message,
              );
            }
          }

          // Ajouter le produit avec ses images uploadées
          processedProducts.push({
            ...product,
            uploadedImages,
          });
        } catch (productError: any) {
          console.error(
            `❌ Erreur traitement produit ${product.id}:`,
            productError.message,
          );
          processedProducts.push(product);
        }
      }

      processedCollections.push({
        ...collection,
        products: processedProducts,
      });
    }

    console.log(`✅ Traitement terminé - ${totalImages} images uploadées`);

    // Envoyer les données complètes du catalogue au backend pour sauvegarde en BD (via nodeFetch)
    console.log('💾 Envoi des données du catalogue au backend...');

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
        }),
      },
    );

    if (catalogSaveResponse.ok) {
      const saveResult = await catalogSaveResponse.json();
      console.log(
        '✅ Catalogue sauvegardé en base de données:',
        saveResult.stats,
      );

      return {
        success: true,
        collections: processedCollections,
        stats: {
          collectionsCount: processedCollections.length,
          productsCount: processedCollections.reduce(
            (acc, col) => acc + (col.products?.length || 0),
            0,
          ),
          imagesCount: totalImages,
        },
        dbStats: saveResult.stats,
      };
    } else {
      console.error('❌ Erreur lors de la sauvegarde du catalogue en BD');
      return {
        success: true, // Les images sont uploadées même si la sauvegarde en BD échoue
        collections: processedCollections,
        stats: {
          collectionsCount: processedCollections.length,
          productsCount: processedCollections.reduce(
            (acc, col) => acc + (col.products?.length || 0),
            0,
          ),
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
