import {
  ClockCircleOutlined,
  SaveOutlined,
  TeamOutlined,
  TagOutlined,
  MessageOutlined,
  DollarOutlined,
  CarOutlined,
  FieldTimeOutlined,
  CommentOutlined,
} from '@ant-design/icons'
import type { ComponentType } from 'react'

export interface FeatureItem {
  title: string
  icon: ComponentType
  description: string
}

export interface FeatureCategory {
  title: string
  features: FeatureItem[]
}

export const featuresConfig: Record<string, FeatureCategory> = {
  marketing: {
    title: 'Status scheduler',
    features: [
      {
        title: 'Relance des clients si nécessaire',
        icon: ClockCircleOutlined,
        description:
          "Si dans une conversation le client dis qu'il nous revient lundi par exemple, notre IA envoie un message de relance le lundi automatiquement.",
      },
      {
        title: 'Sauvegarde automatique des contacts',
        icon: SaveOutlined,
        description:
          'Vous pouvez connecter votre compte Google et nous y stockons automatiquement les contacts pour quii veront ensuite vos statuts et votre présence sur WhatsApp.',
      },
      {
        title: 'Classifications des contacts',
        icon: TeamOutlined,
        description:
          "L'IA organise vos contacts en catégories intelligentes : prospects chauds, clients fidèles, clients inactifs, spam etc. Cette segmentation automatique vous aide à cibler vos campagnes marketing avec précision.",
      },
      {
        title: "Status par segment(s) d'utilisateur",
        icon: TagOutlined,
        description:
          "Afin d'eviter de publier un grand nombre de statuts, notre IA vous permet de choisir les segments de contacts sur lesquels vous souhaitez publier.",
      },
    ],
  },
  ventes: {
    title: 'Ventes',
    features: [
      {
        title: 'Réponses aux questions',
        icon: MessageOutlined,
        description:
          "L'IA répond instantanément aux questions de vos clients 24/7 en se basant sur vos instructions, la description de vos produits et votre politique de vente. Elle comprend le contexte et fournit des réponses précises et personnalisées qui correspondent à votre ton et votre image de marque.",
      },
      {
        title: 'Négociations des prix suivant vos règles',
        icon: DollarOutlined,
        description:
          "Définissez vos règles de négociation (remises maximales, conditions, volumes) et l'IA gère les discussions tarifaires de manière autonome. Elle sait quand proposer une promotion, un bundle ou escalader vers un humain.",
      },
      {
        title: 'Demande des informations de livraison',
        icon: CarOutlined,
        description:
          "L'agent collecte automatiquement toutes les informations nécessaires pour la livraison : adresse complète, préférences d'horaire, instructions spéciales. Il valide les données et peut même proposer des options de livraison express ou standard.",
      },
      {
        title: 'Notification dans des groupes',
        icon: CarOutlined,
        description:
          'Notre IA est capable de comprendre les groupes où se trouves vos collaborateurs et de les notifier en cas de besoin (Nouvelle commande, Demande de devis, Demande de retour, etc)',
      },
      {
        title: 'Disponible 24h/24 et 7 jours sur 7',
        icon: FieldTimeOutlined,
        description:
          "Votre assistant IA ne dort jamais. Il répond instantanément à vos clients, peu importe l'heure ou le jour. Capturez les ventes même pendant la nuit, les weekends et les jours fériés sans aucun coût supplémentaire.",
      },
    ],
  },
  community: {
    title: 'Community management',
    features: [
      {
        title: 'Réponses aux commentaires',
        icon: CommentOutlined,
        description:
          'Notre IA peut se connecter à votre page Facebook ou Instagram et répondre aux commentaires de vos clients en temps réel.',
      },
      {
        title: 'Détection de vol de leads',
        icon: TagOutlined,
        description:
          'Notre IA peut se connecter à votre page Facebook ou Instagram et masquer/supprimer les commentaires qui tentes de détourner vos clients potentiels.',
      },
      {
        title: 'Détection commentaires malveillants',
        icon: TagOutlined,
        description:
          'Notre IA peut se connecter à votre page Facebook ou Instagram et masquer/supprimer les commentaires inappropriés (insultes, menaces, etc).',
      },
    ],
  },
}
