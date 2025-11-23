/**
 * Supprime un label
 * Variables: LABEL_ID
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
    const labelId = '{{LABEL_ID}}';
    if (!labelId || labelId.includes('{{')) {
      throw new Error('LABEL_ID is required')
    }

    await window.WPP.labels.deleteLabel(labelId);

    return {
      success: true,
      deleted: labelId,
    };
  } catch (error) {
    console.error('Failed to delete label:', error);
    throw error;
  }
})();
