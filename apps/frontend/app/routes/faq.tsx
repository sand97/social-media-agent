import {
  QuestionCircleOutlined,
  ReadOutlined,
  RocketOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { DashboardHeader } from '@app/components/layout'
import { CollapsibleCard } from '@app/components/ui'
import { useMemo, useState, type ReactNode } from 'react'

type FaqItem = {
  key: string
  category: string
  question: string
  answer: string[]
}

const FAQ_ITEMS: FaqItem[] = [
  {
    key: 'demarrage',
    category: 'Onboarding',
    question: "Comment lancer l'agent pour la première fois ?",
    answer: [
      'Commencez par connecter votre numéro WhatsApp depuis les écrans de connexion, puis complétez le contexte de l’IA avant d’activer le mode production.',
      'Le score de contexte sert de garde-fou : tant qu’il reste insuffisant, les pages sensibles du dashboard demeurent verrouillées.',
    ],
  },
  {
    key: 'catalogue',
    category: 'Catalogue',
    question: 'À quoi sert la page Catalogue ?',
    answer: [
      'Le catalogue centralise vos produits et permet à l’agent de s’appuyer sur une base métier cohérente pour répondre correctement.',
      'Plus vos fiches sont précises, plus les suggestions générées dans WhatsApp gagnent en pertinence.',
    ],
  },
  {
    key: 'status',
    category: 'Marketing',
    question: 'Que puis-je faire avec le Status scheduler ?',
    answer: [
      'Le planificateur permet de préparer à l’avance des statuts texte, image ou vidéo sur un calendrier mensuel.',
      'Vous pouvez ensuite suivre les contenus planifiés par jour et ajuster rapidement les horaires ou supprimer une publication.',
    ],
  },
  {
    key: 'stats',
    category: 'Pilotage',
    question: 'Comment lire les statistiques du dashboard ?',
    answer: [
      'La page Statistiques compare vos messages et conversations sur une période choisie afin d’identifier les évolutions importantes.',
      'Les deltas et graphiques servent surtout à visualiser la tendance, pas à remplacer une analyse commerciale détaillée.',
    ],
  },
  {
    key: 'leads',
    category: 'Roadmap',
    question: 'À quoi servira la page Leads ?',
    answer: [
      'La page Leads aidera à rassembler les conversations à suivre, les relances importantes et les opportunités en cours.',
      'Les labels utilisateur serviront de base pour mieux trier les demandes et garder une vue claire sur les priorités.',
    ],
  },
  {
    key: 'forfaits',
    category: 'Abonnement',
    question: 'Où comparer les différents forfaits ?',
    answer: [
      'La nouvelle page Forfaits présente les trois offres du produit avec un résumé, les usages ciblés et un point d’entrée pour contacter le support.',
      'Si votre plan courant est connu par le frontend, il est automatiquement mis en avant sur la page.',
    ],
  },
  {
    key: 'support',
    category: 'Support',
    question: 'Comment envoyer un retour produit ou signaler un bug ?',
    answer: [
      'La page Support embarque un formulaire connecté à Sentry User Feedback pour centraliser les retours fonctionnels et techniques.',
      'Le formulaire transmet le message ainsi que quelques métadonnées utiles non sensibles, comme la page courante et le plan détecté.',
    ],
  },
]

const CATEGORY_ICON: Record<string, ReactNode> = {
  Abonnement: <ReadOutlined />,
  Catalogue: <SettingOutlined />,
  Marketing: <RocketOutlined />,
  Onboarding: <QuestionCircleOutlined />,
  Pilotage: <ReadOutlined />,
  Roadmap: <RocketOutlined />,
  Support: <QuestionCircleOutlined />,
}

export function meta() {
  return [
    { title: 'FAQ - WhatsApp Agent' },
    {
      name: 'description',
      content:
        'Questions fréquentes du dashboard WhatsApp Agent avec sections repliables',
    },
  ]
}

export default function FaqPage() {
  const [expandedItems, setExpandedItems] = useState<string[]>([])
  const groupedItems = useMemo(() => {
    return FAQ_ITEMS.reduce<Record<string, FaqItem[]>>((groups, item) => {
      const entry = groups[item.category] || []
      entry.push(item)
      groups[item.category] = entry
      return groups
    }, {})
  }, [])

  const toggleItem = (itemKey: string, expanded: boolean) => {
    setExpandedItems(previous => {
      if (expanded) {
        return previous.includes(itemKey) ? previous : [...previous, itemKey]
      }

      return previous.filter(key => key !== itemKey)
    })
  }

  return (
    <>
      <DashboardHeader title='FAQ' />

      <div className='w-full space-y-6 px-4 py-5 sm:px-6 sm:py-6'>
        {Object.entries(groupedItems).map(([category, items]) => (
          <section key={category} className='space-y-3'>
            <div className='flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]'>
              <span className='inline-flex h-6 w-6 items-center justify-center text-base'>
                {CATEGORY_ICON[category] || <QuestionCircleOutlined />}
              </span>
              <span>{category}</span>
            </div>

            <div className='merge-border-radius grid gap-2'>
              {items.map(item => (
                <CollapsibleCard
                  key={item.key}
                  title={item.question}
                  subtitle={item.answer.join('\n')}
                  expanded={expandedItems.includes(item.key)}
                  hideSubtitleWhenExpanded
                  onToggle={expanded => toggleItem(item.key, expanded)}
                >
                  <div className='space-y-3'>
                    {item.answer.map(paragraph => (
                      <p
                        key={paragraph}
                        className='m-0 text-sm leading-[1.75] text-[var(--color-text-secondary)]'
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </CollapsibleCard>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
