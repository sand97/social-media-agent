/**
 * Get all WhatsApp catalog collections
 * Returns list of collections without products
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
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

    return collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      productsCount: collection.products?.length || 0,
    }));
  } catch (error) {
    console.error('Failed to get collections:', error);
    throw error;
  }
})();
