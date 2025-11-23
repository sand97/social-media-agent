/**
 * Crée un nouveau label WhatsApp
 * Variables: LABEL_NAME, LABEL_COLOR (optional, colorIndex 0-19)
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
    // Helper to check if placeholder was replaced
    const getParam = (value, defaultValue) => {
      if (!value || value.includes('{{')) return defaultValue
      return value
    }

    const labelName = '{{LABEL_NAME}}';
    if (!labelName || labelName.includes('{{')) {
      throw new Error('LABEL_NAME is required')
    }

    const colorStr = getParam('{{LABEL_COLOR}}', '');

    // Get palette and existing labels
    const palette = await window.WPP.labels.getLabelColorPalette();
    const existingLabels = await window.WPP.labels.getAllLabels();

    // Check if label with same name already exists
    const existingLabel = existingLabels.find(
      label => label.name.toLowerCase() === labelName.toLowerCase()
    );
    if (existingLabel) {
      // Label already exists, return it
      return {
        id: existingLabel.id,
        name: existingLabel.name,
        hexColor: existingLabel.hexColor,
        colorIndex: existingLabel.colorIndex,
        alreadyExists: true,
      };
    }

    // Get used color indices
    const usedColorIndices = new Set(existingLabels.map(label => label.colorIndex));

    // Get available (unused) color indices
    const availableIndices = [];
    for (let i = 0; i < palette.length; i++) {
      if (!usedColorIndices.has(i)) {
        availableIndices.push(i);
      }
    }

    // Helper to get random from available or all if none available
    const getRandomColorIndex = () => {
      if (availableIndices.length > 0) {
        const randomIdx = Math.floor(Math.random() * availableIndices.length);
        return String(availableIndices[randomIdx]);
      }
      // All colors used, pick any random
      return String(Math.floor(Math.random() * palette.length));
    };

    let labelColor;
    if (colorStr && colorStr.trim() !== '') {
      const trimmed = colorStr.trim();

      // Check if it's a valid index (0-19)
      const asNumber = parseInt(trimmed);
      if (!isNaN(asNumber) && asNumber >= 0 && asNumber < palette.length) {
        labelColor = String(asNumber);
      }
      // Check if it's a hex color in the palette
      else if (trimmed.startsWith('#')) {
        const hexUpper = trimmed.toUpperCase();
        const foundIndex = palette.findIndex(c => c.toUpperCase() === hexUpper);
        if (foundIndex !== -1) {
          labelColor = String(foundIndex);
        } else {
          // Hex not in palette, use random unused color
          labelColor = getRandomColorIndex();
        }
      } else {
        // Invalid format, use random unused color
        labelColor = getRandomColorIndex();
      }
    } else {
      // No color specified, use random unused color
      labelColor = getRandomColorIndex();
    }

    const result = await window.WPP.labels.addNewLabel(labelName, { labelColor });

    return {
      id: result.id,
      name: result.name,
      hexColor: result.hexColor,
      colorIndex: result.colorIndex,
    };
  } catch (error) {
    console.error('Failed to add label:', error);
    throw error;
  }
})();
