import {
  CustomerServiceOutlined,
  FileImageOutlined,
  MessageOutlined,
  QuestionCircleOutlined,
  RocketOutlined,
  ShoppingOutlined,
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
  // ── Catalogue & Produits ──
  {
    key: 'catalogue-retailer-id',
    category: 'Catalogue & Produits',
    question: 'Comment bien définir le Retailer ID de mes produits ?',
    answer: [
      'Le Retailer ID est l\u2019identifiant unique que vous attribuez \u00e0 chaque produit dans votre catalogue WhatsApp Business. Choisissez un code court, m\u00e9morisable et sans ambigu\u00eft\u00e9, par exemple \u00ab\u00a0SNK-AF1-BLC\u00a0\u00bb plut\u00f4t qu\u2019un long num\u00e9ro g\u00e9n\u00e9r\u00e9 automatiquement.',
      'Ce code doit rester unique dans tout votre catalogue. Il est utilis\u00e9 par l\u2019agent pour identifier pr\u00e9cis\u00e9ment un article lorsqu\u2019un client le mentionne dans la conversation.',
    ],
  },
  {
    key: 'catalogue-retailer-id-usage',
    category: 'Catalogue & Produits',
    question: 'Comment utiliser le Retailer ID dans mes publications ?',
    answer: [
      'Indiquez le Retailer ID dans vos stories, posts et visuels produit afin que vos clients puissent le recopier dans la conversation WhatsApp.',
      'Lorsque l\u2019agent d\u00e9tecte un Retailer ID connu dans un message, il retrouve automatiquement le produit correspondant et peut l\u2019envoyer au client sans \u00e9tape suppl\u00e9mentaire.',
    ],
  },
  {
    key: 'catalogue-sync',
    category: 'Catalogue & Produits',
    question: 'Comment synchroniser mon catalogue WhatsApp avec le dashboard ?',
    answer: [
      'Utilisez le bouton \u00ab\u00a0Forcer la synchronisation\u00a0\u00bb dans la page Catalogue. Le syst\u00e8me r\u00e9cup\u00e8re vos collections et produits directement depuis WhatsApp Business, met \u00e0 jour la base de donn\u00e9es et indexe les images pour la recherche par similarit\u00e9.',
      'La synchronisation traite aussi les images\u00a0: elles sont stock\u00e9es, d\u00e9coup\u00e9es intelligemment et vectoris\u00e9es pour permettre la reconnaissance visuelle de vos produits.',
    ],
  },
  {
    key: 'catalogue-collections',
    category: 'Catalogue & Produits',
    question:
      '\u00c0 quoi servent les collections et comment l\u2019agent les utilise\u00a0?',
    answer: [
      'Les collections regroupent vos produits par th\u00e8me ou cat\u00e9gorie dans WhatsApp Business. L\u2019agent peut envoyer une collection enti\u00e8re \u00e0 un client qui cherche un type d\u2019article pr\u00e9cis, ou le lien complet de votre catalogue.',
      'Plus vos fiches et collections sont bien organis\u00e9es, plus les recommandations de l\u2019agent seront pertinentes et rapides.',
    ],
  },

  // ── M\u00e9dias support\u00e9s ──
  {
    key: 'media-images',
    category: 'M\u00e9dias support\u00e9s',
    question: 'Que se passe-t-il quand un client envoie une image\u00a0?',
    answer: [
      'L\u2019agent analyse l\u2019image en plusieurs \u00e9tapes\u00a0: extraction de texte (OCR) pour d\u00e9tecter un \u00e9ventuel Retailer ID, comparaison visuelle par similarit\u00e9 d\u2019image avec votre catalogue index\u00e9, et description intelligente via Gemini Vision.',
      'Si un produit correspondant est trouv\u00e9 dans votre catalogue, l\u2019agent le propose directement au client. Sinon, il utilise la description g\u00e9n\u00e9r\u00e9e pour mieux comprendre la demande et formuler une r\u00e9ponse adapt\u00e9e.',
    ],
  },
  {
    key: 'media-audio',
    category: 'M\u00e9dias support\u00e9s',
    question: 'L\u2019agent peut-il comprendre les messages vocaux\u00a0?',
    answer: [
      'Oui. Chaque message vocal re\u00e7u est automatiquement transcrit gr\u00e2ce \u00e0 Gemini 2.5. L\u2019agent obtient le texte exact de ce que le client a dit, puis raisonne dessus comme pour un message texte classique.',
      'La transcription fonctionne dans la langue du client et prend en charge les notes vocales ainsi que les fichiers audio envoy\u00e9s en pi\u00e8ce jointe.',
    ],
  },
  {
    key: 'media-video',
    category: 'M\u00e9dias support\u00e9s',
    question: 'Les vid\u00e9os sont-elles prises en charge\u00a0?',
    answer: [
      'Non, les vid\u00e9os ne sont pas encore analys\u00e9es par l\u2019agent. Si un client envoie une vid\u00e9o, l\u2019agent ne pourra pas en extraire le contenu.',
      'Si votre client a besoin de partager un produit en vid\u00e9o, conseillez-lui d\u2019envoyer plut\u00f4t une capture d\u2019\u00e9cran ou une photo du produit qui sera analys\u00e9e normalement.',
    ],
  },

  // ── Traitement des messages ──
  {
    key: 'messages-delai',
    category: 'Traitement des messages',
    question:
      'Combien de temps met l\u2019agent pour r\u00e9pondre \u00e0 un message\u00a0?',
    answer: [
      'Le temps de r\u00e9ponse varie entre 5 et 30 secondes selon le type de message. Un message texte simple est trait\u00e9 plus rapidement qu\u2019une image n\u00e9cessitant OCR, similarit\u00e9 visuelle et description par IA.',
      'Les messages vocaux ajoutent une \u00e9tape de transcription qui peut allonger l\u00e9g\u00e8rement le d\u00e9lai, mais la r\u00e9ponse reste g\u00e9n\u00e9ralement sous les 20 secondes.',
    ],
  },
  {
    key: 'messages-admin-group',
    category: 'Traitement des messages',
    question: 'Comment fonctionne le groupe d\u2019administration\u00a0?',
    answer: [
      'Lorsque l\u2019agent d\u00e9tecte une situation qui n\u00e9cessite une intervention humaine (demande complexe, r\u00e9clamation, demande de remboursement\u2026), il transf\u00e8re automatiquement la conversation dans votre groupe d\u2019administration WhatsApp.',
      'Le message transf\u00e9r\u00e9 inclut le num\u00e9ro du contact et un r\u00e9sum\u00e9 de la situation, pour que votre \u00e9quipe puisse prendre le relais imm\u00e9diatement sans perdre le contexte.',
    ],
  },
  {
    key: 'messages-relances',
    category: 'Traitement des messages',
    question:
      'L\u2019agent peut-il programmer des relances automatiques\u00a0?',
    answer: [
      'Oui. L\u2019agent peut planifier des \u00ab\u00a0intentions\u00a0\u00bb intelligentes, par exemple relancer un client dans 48\u00a0h s\u2019il n\u2019a pas r\u00e9pondu. Au moment programm\u00e9, il v\u00e9rifie d\u2019abord la condition (le client a-t-il r\u00e9pondu\u00a0?), puis agit en cons\u00e9quence.',
      'Vous pouvez retrouver les relances en attente et les annuler si le contexte a chang\u00e9. Les types disponibles incluent le suivi, le rappel de commande, le rappel de paiement et la mise \u00e0 jour de livraison.',
    ],
  },
  {
    key: 'messages-labels',
    category: 'Traitement des messages',
    question: 'Comment l\u2019agent classe-t-il mes contacts\u00a0?',
    answer: [
      'L\u2019agent utilise le syst\u00e8me de labels WhatsApp pour cat\u00e9goriser automatiquement vos contacts en fonction de la conversation\u00a0: prospect chaud, commande en cours, client fid\u00e8le, etc.',
      'Vous d\u00e9finissez vos labels dans WhatsApp Business, et l\u2019agent les applique ou les retire au fil des \u00e9changes. Ces labels serviront aussi de base pour la future page Leads.',
    ],
  },

  // ── Stories & Marketing ──
  {
    key: 'stories-frequence',
    category: 'Stories & Marketing',
    question: 'Combien de stories publier par jour\u00a0?',
    answer: [
      'Nous recommandons de publier entre 4 et 5 stories par jour. Au-del\u00e0, vos contacts voient une longue barre de progression et ont tendance \u00e0 passer votre profil sans regarder.',
      'Mieux vaut publier moins de stories mais bien cibl\u00e9es, plut\u00f4t que d\u2019en encha\u00eener beaucoup au risque de lasser votre audience.',
    ],
  },
  {
    key: 'stories-ligne-editoriale',
    category: 'Stories & Marketing',
    question: 'Combien de sujets aborder dans mes stories\u00a0?',
    answer: [
      'Gardez une seule ligne de communication par journ\u00e9e. Si vous m\u00e9langez promotions, tutoriels et annonces dans la m\u00eame s\u00e9rie de stories, le message perd en clart\u00e9 et l\u2019engagement diminue.',
      'Choisissez un th\u00eame unique par jour (par exemple, la mise en avant d\u2019un produit, une astuce d\u2019utilisation ou un t\u00e9moignage client) et restez coh\u00e9rent du d\u00e9but \u00e0 la fin.',
    ],
  },
  {
    key: 'stories-scheduler',
    category: 'Stories & Marketing',
    question: 'Comment utiliser le planificateur de stories\u00a0?',
    answer: [
      'Le planificateur vous permet de programmer \u00e0 l\u2019avance des statuts texte ou image sur un calendrier mensuel. Vous choisissez la date, l\u2019heure et le contenu, et la publication se fait automatiquement.',
      'Vous pouvez consulter vos publications planifi\u00e9es, modifier les horaires ou supprimer un statut \u00e0 tout moment depuis le calendrier.',
    ],
  },

  // ── Onboarding & Param\u00e8tres ──
  {
    key: 'onboarding-demarrage',
    category: 'Onboarding & Param\u00e8tres',
    question: 'Comment d\u00e9marrer avec WhatsApp Agent\u00a0?',
    answer: [
      'Commencez par connecter votre num\u00e9ro WhatsApp depuis l\u2019\u00e9cran de connexion avec le code d\u2019appairage. Compl\u00e9tez ensuite le contexte de l\u2019IA via la page d\u2019onboarding pour d\u00e9crire votre activit\u00e9, vos produits et vos consignes.',
      'Le score de contexte sert de garde-fou\u00a0: tant qu\u2019il n\u2019atteint pas 80\u00a0%, l\u2019agent n\u2019est pas activ\u00e9 en production. Plus vous fournissez d\u2019informations pr\u00e9cises, meilleur sera le score.',
    ],
  },
  {
    key: 'onboarding-parametres',
    category: 'Onboarding & Param\u00e8tres',
    question:
      'Quels param\u00e8tres puis-je configurer pour mon activit\u00e9\u00a0?',
    answer: [
      'Depuis les param\u00e8tres, vous pouvez renseigner les informations de votre entreprise, g\u00e9rer vos zones de livraison et configurer vos moyens de paiement accept\u00e9s.',
      'Ces informations sont utilis\u00e9es par l\u2019agent pour r\u00e9pondre aux questions courantes des clients sur la livraison et le paiement, sans que vous ayez \u00e0 intervenir.',
    ],
  },
  {
    key: 'onboarding-stats',
    category: 'Onboarding & Param\u00e8tres',
    question: 'Comment lire les statistiques du dashboard\u00a0?',
    answer: [
      'La page Statistiques compare vos messages et conversations sur une p\u00e9riode choisie afin d\u2019identifier les \u00e9volutions importantes et suivre l\u2019activit\u00e9 de votre agent.',
      'Les deltas et graphiques vous donnent une vue d\u2019ensemble de la tendance. Utilisez-les pour v\u00e9rifier que l\u2019agent traite bien les volumes attendus.',
    ],
  },

  // ── Support & Abonnement ──
  {
    key: 'support-feedback',
    category: 'Support & Abonnement',
    question: 'Comment signaler un bug ou envoyer un retour\u00a0?',
    answer: [
      'La page Support embarque un formulaire connect\u00e9 \u00e0 Sentry pour centraliser vos retours. Choisissez la cat\u00e9gorie (bug, question produit, demande d\u2019\u00e9volution ou upgrade), puis d\u00e9crivez votre situation.',
      'Le formulaire transmet automatiquement quelques m\u00e9tadonn\u00e9es utiles comme la page courante et votre plan, pour que l\u2019\u00e9quipe puisse reproduire le probl\u00e8me plus facilement.',
    ],
  },
  {
    key: 'support-forfaits',
    category: 'Support & Abonnement',
    question: 'O\u00f9 comparer les diff\u00e9rents forfaits\u00a0?',
    answer: [
      'La page Forfaits pr\u00e9sente les offres disponibles avec un r\u00e9sum\u00e9 des fonctionnalit\u00e9s incluses, les usages cibl\u00e9s et les tarifs selon la dur\u00e9e d\u2019engagement choisie.',
      'Si votre plan courant est connu, il est automatiquement mis en avant. Vous pouvez contacter le support directement depuis cette page pour changer de formule.',
    ],
  },
  {
    key: 'support-leads',
    category: 'Support & Abonnement',
    question: '\u00c0 quoi servira la page Leads\u00a0?',
    answer: [
      'La page Leads rassemblera prochainement les conversations \u00e0 suivre, les relances importantes et les opportunit\u00e9s en cours pour vous donner une vue CRM simplifi\u00e9e.',
      'Les labels que l\u2019agent applique automatiquement serviront de base pour trier vos contacts et prioriser les actions commerciales.',
    ],
  },
]

const CATEGORY_ICON: Record<string, ReactNode> = {
  'Catalogue & Produits': <ShoppingOutlined />,
  'M\u00e9dias support\u00e9s': <FileImageOutlined />,
  'Traitement des messages': <MessageOutlined />,
  'Stories & Marketing': <RocketOutlined />,
  'Onboarding & Param\u00e8tres': <QuestionCircleOutlined />,
  'Support & Abonnement': <CustomerServiceOutlined />,
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
