/**
 * Send a catalog collection to a chat
 * Variables: TO (required), COLLECTION_ID (required)
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  const to = '{{TO}}';
  const collectionId = '{{COLLECTION_ID}}';

  if (!to || to.includes('{{')) {
    throw new Error('TO is required');
  }

  if (!collectionId || collectionId.includes('{{')) {
    throw new Error('COLLECTION_ID is required');
  }

  const result = await WPP.catalog.sendCatalog(to, collectionId);
  return result;
})();
