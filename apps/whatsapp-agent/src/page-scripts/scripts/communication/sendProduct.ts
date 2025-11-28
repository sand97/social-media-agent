/**
 * Send a product from the catalog to a chat
 * Variables: TO (required), PRODUCT_ID (required)
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  const to = '{{TO}}';
  const productId = '{{PRODUCT_ID}}';

  if (!to || to.includes('{{')) {
    throw new Error('TO is required');
  }

  if (!productId || productId.includes('{{')) {
    throw new Error('PRODUCT_ID is required');
  }

  const result = await WPP.catalog.sendProductWithCatalog(to, productId);
  return result;
})();
