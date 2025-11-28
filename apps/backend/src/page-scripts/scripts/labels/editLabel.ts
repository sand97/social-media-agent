/**
 * Modifie un label existant
 * Variables: LABEL_ID, LABEL_NAME, LABEL_COLOR (optionnel, colorIndex 0-19)
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
    // Helper to check if placeholder was replaced
    const getParam = (value, defaultValue) => {
      if (!value || value.includes('{{')) return defaultValue;
      return value;
    };

    const labelId = '{{LABEL_ID}}';
    if (!labelId || labelId.includes('{{')) {
      throw new Error('LABEL_ID is required');
    }
    const name = '{{LABEL_NAME}}';
    if (!name || name.includes('{{')) {
      throw new Error('LABEL_NAME is required');
    }
    const colorStr = getParam('{{LABEL_COLOR}}', '');

    // Only pass color if it's a valid non-empty value
    const color =
      colorStr && colorStr.trim() !== '' ? parseInt(colorStr) : undefined;

    const result = await window.WPP.labels.editLabel(
      labelId,
      name,
      isNaN(color) ? undefined : color,
    );

    return {
      id: result.id,
      name: result.name,
      hexColor: result.hexColor,
      colorIndex: result.colorIndex,
    };
  } catch (error) {
    console.error('Failed to edit label:', error);
    throw error;
  }
})();
