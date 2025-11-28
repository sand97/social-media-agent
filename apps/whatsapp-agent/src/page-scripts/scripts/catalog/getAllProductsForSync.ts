/**
 * Get all products from all collections for synchronization
 * No variables required
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  const collections = await WPP.catalog.getCollections();
  let allProducts = [];

  for (const collection of collections) {
    const products = await WPP.catalog.getProductsFromCollection(
      collection.id,
      1000,
    );

    allProducts = allProducts.concat(
      products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        currency: p.currency,
        availability: p.availability,
        retailerId: p.retailerId,
        maxAvailable: p.maxAvailable,
        imageHashesForWhatsapp: p.imageHashesForWhatsapp || [],
        collectionId: collection.id,
        collectionName: collection.name,
      })),
    );
  }

  return allProducts;
})();
