/**
 * Récupère tous les labels WhatsApp
 * Variables: aucune
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
    const labels = await window.WPP.labels.getAllLabels();

    return labels.map((label) => ({
      id: label.id,
      name: label.name,
      hexColor: label.hexColor,
      colorIndex: label.colorIndex,
      count: label.count,
    }));
  } catch (error) {
    console.error('Failed to get labels:', error);
    throw error;
  }
})();
