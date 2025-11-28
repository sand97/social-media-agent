/**
 * Search products by keywords
 * Variables: QUERY (required), LIMIT (optional, default 10)
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  const query = '{{QUERY}}';
  if (!query || query.includes('{{')) {
    throw new Error('QUERY is required');
  }

  const limit = parseInt('{{LIMIT}}') || 10;
  const searchQuery = query.toLowerCase();

  const collections = await WPP.catalog.getCollections();
  let allProducts = [];

  for (const collection of collections) {
    const products = await WPP.catalog.getProductsFromCollection(
      collection.id,
      100,
    );

    // Filter by query
    const filtered = products.filter(
      (p) =>
        p.name?.toLowerCase().includes(searchQuery) ||
        p.description?.toLowerCase().includes(searchQuery) ||
        collection.name?.toLowerCase().includes(searchQuery),
    );

    allProducts = allProducts.concat(
      filtered.map((p) => ({
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
