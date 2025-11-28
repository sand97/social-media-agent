/**
 * Get products from a specific collection
 * Variables: COLLECTION_ID
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
    const collectionId = '{{COLLECTION_ID}}';
    if (!collectionId || collectionId.includes('{{')) {
      throw new Error('COLLECTION_ID is required');
    }

    // Get user ID
    const userId = window.WPP.conn?.getMyUserId()?._serialized || '';

    if (!userId) {
      throw new Error('User ID not found');
    }

    // Get all collections
    const collections = await window.WPP.catalog.getCollections(
      userId,
      50,
      100,
    );

    // Find the specific collection
    const collection = collections.find((c) => c.id === collectionId);

    if (!collection) {
      throw new Error(`Collection ${collectionId} not found`);
    }

    return (collection.products || []).map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      currency: product.currency,
      availability: product.availability,
      isHidden: product.isHidden,
      imageUrl: product.imageUrl,
    }));
  } catch (error) {
    console.error('Failed to get products from collection:', error);
    throw error;
  }
})();
