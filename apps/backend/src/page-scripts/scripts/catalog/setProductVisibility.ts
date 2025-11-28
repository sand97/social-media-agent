/**
 * Set product visibility in catalog
 * Variables: PRODUCT_ID, VISIBLE (true/false)
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
    const productId = '{{PRODUCT_ID}}';
    if (!productId || productId.includes('{{')) {
      throw new Error('PRODUCT_ID is required');
    }
    const visibleStr = '{{VISIBLE}}';
    if (!visibleStr || visibleStr.includes('{{')) {
      throw new Error('VISIBLE is required ("true" or "false")');
    }
    const visible = visibleStr === 'true';

    await window.WPP.catalog.setProductVisibility(productId, visible);

    return {
      success: true,
      productId,
      visible,
    };
  } catch (error) {
    console.error('Failed to set product visibility:', error);
    throw error;
  }
})();
