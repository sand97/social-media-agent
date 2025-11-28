/**
 * Get all catalog collections with their products
 * Variables: LIMIT (optional, default 20)
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  const limit = parseInt('{{LIMIT}}') || 20;

  const collections = await WPP.catalog.getCollections();
  let allProducts = [];

  for (const collection of collections) {
    const products = await WPP.catalog.getProductsFromCollection(
      collection.id,
      limit,
    );
    allProducts = allProducts.concat(
      products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        currency: p.currency,
        availability: p.availability,
        collectionName: collection.name,
      })),
    );
  }

  return allProducts.slice(0, limit);
})();
