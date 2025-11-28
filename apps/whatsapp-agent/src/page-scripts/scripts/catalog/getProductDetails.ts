/**
 * Get detailed information about a specific product
 * Variables: PRODUCT_ID (required)
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  const productId = '{{PRODUCT_ID}}';
  if (!productId || productId.includes('{{')) {
    throw new Error('PRODUCT_ID is required');
  }

  // Find the product in all collections
  const collections = await WPP.catalog.getCollections();

  for (const collection of collections) {
    const products = await WPP.catalog.getProductsFromCollection(
      collection.id,
      100,
    );
    const product = products.find((p) => p.id === productId);

    if (product) {
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        currency: product.currency,
        availability: product.availability,
        maxAvailable: product.maxAvailable,
        url: product.url,
        retailerId: product.retailerId,
        collectionName: collection.name,
        collectionId: collection.id,
        imageHashes: product.imageHashesForWhatsapp || [],
      };
    }
  }

  return null;
})();
