/**
 * Configuration des étapes de synchronisation WhatsApp
 * Mapping des étapes avec leurs titres et descriptions pour l'UI
 */

export interface SyncStepConfig {
  title: string
  description: string
}

export const SYNC_STEPS_CONFIG: Record<
  'clientInfo' | 'catalog',
  SyncStepConfig
> = {
  clientInfo: {
    title: 'Synchronisation du profil',
    description:
      "Nous récupérons les informations de votre compte WhatsApp Business : nom du profil, avatar, informations de l'entreprise (description, horaires, catégories, coordonnées).",
  },
  catalog: {
    title: 'Récupération du catalogue',
    description:
      'Nous synchronisons votre catalogue produits : collections, produits, descriptions, prix et images. Cette étape peut prendre quelques minutes selon la taille de votre catalogue.',
  },
}

/**
 * Get the display info for a sync step
 */
export function getSyncStepInfo(
  step: 'clientInfo' | 'catalog'
): SyncStepConfig {
  return SYNC_STEPS_CONFIG[step]
}
