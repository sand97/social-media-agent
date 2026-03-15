import { ArrowRightOutlined } from '@ant-design/icons'
import MoreDownIcon from '@app/assets/MoreDown.svg?react'
import AIImageSearchIcon from '@app/assets/pricing/ai-image-search.svg?react'
import AsyncIcon from '@app/assets/pricing/async.svg?react'
import AudioWaveIcon from '@app/assets/pricing/audio-wave.svg?react'
import AudioIllustration from '@app/assets/pricing/AudioIllustration.svg?react'
import BarChartIcon from '@app/assets/pricing/bar-chart.svg?react'
import BarcodeSearchIcon from '@app/assets/pricing/barcode-search.svg?react'
import CatalogLearnIcon from '@app/assets/pricing/catalog-learn.svg?react'
import ContactAddIcon from '@app/assets/pricing/contact-add.svg?react'
import ImageIllustration from '@app/assets/pricing/ImageIllustration.svg?react'
import SimilarityIcon from '@app/assets/pricing/similarity.svg?react'
import StoryScheduleIcon from '@app/assets/pricing/story-schedule.svg?react'
import TextContextIcon from '@app/assets/pricing/text-context.svg?react'
import TextIllustration from '@app/assets/pricing/TextIllustration.svg?react'
import { DashboardHeader } from '@app/components/layout'
import { useAuth } from '@app/hooks/useAuth'
import { resolveCurrentPlanKey, type PlanKey } from '@app/lib/current-plan'
import { Button, Segmented } from 'antd'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

type BillingDuration = 1 | 6 | 12

type PlanFeature = {
  description: string
  icon: ReactNode
  label: string
}

type PlanFeatureGroup = {
  items: PlanFeature[]
  title: string
}

type PlanConfig = {
  accentLabel?: string
  creditAmount: string
  creditSuffix: string
  ctaLabel?: string
  features: PlanFeatureGroup[]
  includedLabel?: string
  monthlyPrice: number
  overagePrice?: string
  overageSuffix?: string
}

type CreditFact = {
  description: string
  illustration: ReactNode
  title: string
}

const PLAN_ORDER: PlanKey[] = ['free', 'pro', 'business']
const BILLING_OPTIONS: Array<{ label: string; value: BillingDuration }> = [
  { label: 'Un mois', value: 1 },
  { label: '6 mois', value: 6 },
  { label: 'Un an', value: 12 },
]

const DURATION_DISCOUNT: Record<BillingDuration, number> = {
  1: 0,
  6: 0.2,
  12: 0.25,
}

const PAYMENT_METHODS = [
  { alt: 'Visa', src: '/payments/visa.jpeg' },
  { alt: 'Mastercard', src: '/payments/mastercard.jpg' },
  { alt: 'Orange Money', src: '/payments/orange-money.jpeg' },
  { alt: 'MTN Mobile Money', src: '/payments/mtn-momo.jpeg' },
]

const PLAN_CONTENT: Record<PlanKey, PlanConfig> = {
  free: {
    creditAmount: '200',
    creditSuffix: 'crédits offerts',
    features: [
      {
        items: [
          {
            description:
              'Discuter avec l’agent pour lui dire comment répondre à vos clients.',
            icon: <TextContextIcon className='h-6 w-6' />,
            label: 'Contextes personnalisés',
          },
          {
            description:
              'L’agent analyse et mémorise les images et descriptions de vos produits.',
            icon: <CatalogLearnIcon className='h-6 w-6' />,
            label: 'Apprentissage du catalogue',
          },
        ],
        title: 'Compréhension de votre entreprise',
      },
      {
        items: [
          {
            description:
              'L’agent comprend les notes vocales comme si c’était du texte.',
            icon: <AudioWaveIcon className='h-6 w-6' />,
            label: 'Compréhension des audio',
          },
        ],
        title: 'Audio',
      },
      {
        items: [
          {
            description:
              'Quand une image contient le code d’un produit, celui-ci est alors identifié.',
            icon: <BarcodeSearchIcon className='h-6 w-6' />,
            label: 'Recherche par retailer ID',
          },
          {
            description:
              'Quand une image ressemble à une des images de vos produits, celui-ci est alors identifié.',
            icon: <SimilarityIcon className='h-6 w-6' />,
            label: 'Recherche par similarité',
          },
        ],
        title: 'Image',
      },
    ],
    monthlyPrice: 0,
  },
  pro: {
    accentLabel: 'Populaire',
    creditAmount: '1 000',
    creditSuffix: 'crédits par mois,',
    ctaLabel: 'Passer à la version Pro',
    features: [
      {
        items: [
          {
            description:
              'L’image est analysée dans le contexte de votre entreprise pour savoir si son contenu cadre fortement avec un de vos produits.',
            icon: <AIImageSearchIcon className='h-6 w-6' />,
            label: 'Recherche par compréhension',
          },
        ],
        title: 'Image',
      },
      {
        items: [
          {
            description:
              'Programmer l’envoi de vos stories en avances peut-importe la période.',
            icon: <StoryScheduleIcon className='h-6 w-6' />,
            label: 'Planification de stories',
          },
        ],
        title: 'Stories',
      },
      {
        items: [
          {
            description:
              'L’agent est capable d’agir même quand aucun message n’est reçu, pour écrire à un client pour un rappel par ex.',
            icon: <AsyncIcon className='h-6 w-6' />,
            label: 'Tâches asynchrones',
          },
        ],
        title: 'Tâches asynchrones',
      },
    ],
    includedLabel: 'Tout dans Free, plus',
    monthlyPrice: 10,
    overagePrice: '$0.01',
    overageSuffix: 'par crédit supplémentaire',
  },
  business: {
    creditAmount: '3 000',
    creditSuffix: 'crédits par mois,',
    ctaLabel: 'Passer à la version Business',
    features: [
      {
        items: [
          {
            description:
              'Une comparaison entre des vues vos stories pour savoir ce qui fonctionne le mieux.',
            icon: <BarChartIcon className='h-6 w-6' />,
            label: 'Statistiques des statuts',
          },
        ],
        title: 'Stories',
      },
      {
        items: [
          {
            description:
              'Créations automatique de contact pour les nouvelle conversations pour qu’il puisse voir vos statuts.',
            icon: <ContactAddIcon className='h-6 w-6' />,
            label: 'Sauvegarde automatique des contacts',
          },
        ],
        title: 'Contacts',
      },
    ],
    includedLabel: 'Tout dans Pro, plus',
    monthlyPrice: 25,
    overagePrice: '$0.008',
    overageSuffix: 'par crédit supplémentaire',
  },
}

const CREDIT_FACTS: CreditFact[] = [
  {
    description:
      'Chaque message texte reçu ou envoyé par l’agent consomme un crédit.',
    illustration: (
      <TextIllustration className='h-[132px] w-[132px] text-[var(--color-text-secondary)]' />
    ),
    title: 'Un crédit par texte',
  },
  {
    description:
      'Chaque analyse d’image consomme deux crédits, quel que soit le mode de recherche utilisé.',
    illustration: (
      <ImageIllustration className='h-[130px] w-[130px] text-[var(--color-text-secondary)]' />
    ),
    title: 'Deux crédits par image',
  },
  {
    description:
      'La transcription et l’analyse d’un message vocal consomme un crédit et demi.',
    illustration: <AudioIllustration className='h-[128px] w-[128px]' />,
    title: '1.5 crédit par audio',
  },
]

function formatDisplayPrice(amount: number, maximumFractionDigits = 2) {
  return `$${amount.toLocaleString('en-US', {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  })}`
}

function getPlanLabel(plan: PlanKey) {
  if (plan === 'free') {
    return 'Free'
  }

  if (plan === 'pro') {
    return 'Pro'
  }

  return 'Business'
}

function getDurationCtaLabel(duration: BillingDuration) {
  return duration === 1 ? 'un' : `${duration}`
}

function getTotalPrice(monthlyPrice: number, duration: BillingDuration) {
  const discountMultiplier = 1 - DURATION_DISCOUNT[duration]
  return Math.round(monthlyPrice * duration * discountMultiplier * 100) / 100
}

function getDisplayedMonthlyPrice(
  monthlyPrice: number,
  duration: BillingDuration
) {
  return (
    Math.round((getTotalPrice(monthlyPrice, duration) / duration) * 10) / 10
  )
}

function renderPlanFooter(config: PlanConfig) {
  if (!config.overagePrice) {
    return (
      <p className='m-0 text-[0px] leading-none tracking-[0.02em]'>
        <span className='text-[18px] font-bold text-[var(--color-text-primary)]'>
          {config.creditAmount}
        </span>
        <span className='ml-1 text-[16px] font-normal text-[var(--color-text-secondary)]'>
          {config.creditSuffix}
        </span>
      </p>
    )
  }

  return (
    <div className='space-y-0.5 text-[16px] leading-[1.8] tracking-[0.02em] text-[var(--color-text-secondary)]'>
      <p className='m-0'>
        <span className='text-[18px] font-bold text-[var(--color-text-primary)]'>
          {config.creditAmount}
        </span>
        <span className='ml-1'>{config.creditSuffix}</span>
      </p>
      <p className='m-0'>
        Puis{' '}
        <span className='font-bold text-[var(--color-text-primary)]'>
          {config.overagePrice}
        </span>{' '}
        {config.overageSuffix}
      </p>
    </div>
  )
}

export function meta() {
  return [
    { title: 'Pricing - WhatsApp Agent' },
    {
      name: 'description',
      content: 'Page de pricing WhatsApp Agent',
    },
  ]
}

export default function PricingPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [duration, setDuration] = useState<BillingDuration>(6)
  const currentPlan = useMemo(() => resolveCurrentPlanKey(user), [user])

  function getDiscountContent(selectedDuration: BillingDuration) {
    if (selectedDuration === 1) {
      return (
        <p className='m-0 text-sm text-[var(--color-text-soft)] h-[34px] flex items-center justify-center'>
          Sans réduction
        </p>
      )
    }

    const pct = Math.round(DURATION_DISCOUNT[selectedDuration] * 100)

    return (
      <div className='flex items-center justify-center gap-2'>
        <span className='text-sm text-[var(--color-text-secondary)]'>
          Profiter de
        </span>
        <span className='inline-flex h-[34px] min-w-[34px] items-center justify-center rounded-full bg-[#24D366] px-2 text-sm font-bold text-black'>
          {pct}%
        </span>
        <span className='text-sm text-[var(--color-text-secondary)]'>
          de réduction pour {selectedDuration} mois
        </span>
      </div>
    )
  }

  return (
    <>
      <DashboardHeader title='Tarifs' />

      <div className='w-full space-y-8 px-4 py-5 sm:px-6 sm:py-6'>
        <div className='flex flex-col items-center gap-3 text-center'>
          <Segmented<BillingDuration>
            className='stats-granularity-toggle pricing-billing-toggle'
            value={duration}
            options={BILLING_OPTIONS}
            onChange={value => setDuration(value)}
          />
          {getDiscountContent(duration)}
        </div>

        <div className='grid min-w-0 gap-4 md:flex md:items-stretch md:gap-0 md:-space-x-px'>
          {PLAN_ORDER.map((plan, index) => {
            const config = PLAN_CONTENT[plan]
            const isCurrent = currentPlan === plan
            const planLabel = getPlanLabel(plan)
            const displayPrice = formatDisplayPrice(
              getDisplayedMonthlyPrice(config.monthlyPrice, duration),
              1
            )
            const totalPrice = formatDisplayPrice(
              getTotalPrice(config.monthlyPrice, duration)
            )

            return (
              <article
                key={plan}
                className={`relative min-w-0 rounded-[20px] border border-[var(--color-field-border-muted)] bg-white p-4 shadow-none md:flex md:flex-1 md:flex-col md:p-4 ${
                  index === 0
                    ? 'md:rounded-l-[20px] md:rounded-r-none'
                    : index === PLAN_ORDER.length - 1
                      ? 'md:rounded-r-[20px] md:rounded-l-none'
                      : 'md:rounded-none'
                }`}
              >
                {config.accentLabel ? (
                  <span className='absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-[var(--color-text-primary)] px-4 py-1.5 text-xs font-semibold text-white'>
                    {config.accentLabel}
                  </span>
                ) : null}

                <div className='flex h-full flex-col gap-5'>
                  <div className='flex h-[200px] flex-col justify-between rounded-[16px] bg-[var(--color-surface-accent)] px-5 pb-4 pt-5'>
                    <p className='m-0 text-base font-bold leading-4 tracking-[0.02em] text-[var(--color-text-primary)]'>
                      {planLabel.toUpperCase()}
                    </p>

                    <div className='text-black'>
                      <span className='text-[38px] font-semibold leading-none tracking-[-0.04em] text-[var(--color-text-primary)]'>
                        {displayPrice}
                      </span>
                      <span className='ml-2 text-[18px] font-normal text-[var(--color-text-secondary)]'>
                        par mois
                      </span>
                    </div>
                  </div>

                  <div className='md:sticky md:top-12 md:z-20 md:-mx-4 md:-mb-5 md:bg-white md:px-4 md:pb-5'>
                    <div className='pointer-events-none absolute inset-x-0 bottom-full hidden h-4 bg-white md:block' />
                    <div>
                      {isCurrent ? (
                        <div className='pricing-current-button'>
                          Votre forfait actuel
                        </div>
                      ) : config.ctaLabel ? (
                        <Button
                          className='dark-button w-full'
                          icon={<ArrowRightOutlined />}
                          iconPosition='end'
                          onClick={() =>
                            navigate('/support', {
                              state: {
                                category: 'upgrade',
                                subject: `Je souhaite passer au plan ${planLabel}`,
                              },
                            })
                          }
                        >
                          {`Passer ${getDurationCtaLabel(duration)} mois en ${planLabel} pour ${totalPrice}`}
                        </Button>
                      ) : (
                        <div className='h-[46px]' />
                      )}
                    </div>

                    {config.includedLabel ? (
                      <div className='mt-5 flex items-center gap-2 px-2 text-base font-normal leading-6 tracking-[0.02em] text-[var(--color-text-primary)]'>
                        <span>{config.includedLabel}</span>
                        <MoreDownIcon className='h-[14px] w-[14px] text-[var(--color-text-secondary)]' />
                      </div>
                    ) : (
                      <div className='mt-5 h-[24px]' />
                    )}
                  </div>

                  <div className='space-y-4'>
                    {config.features.map(group => (
                      <section key={group.title}>
                        <p className='mb-2 px-2 text-base font-normal leading-6 tracking-[0.02em] text-[var(--color-text-secondary)]'>
                          {group.title}
                        </p>

                        <div className='space-y-4'>
                          {group.items.map(feature => (
                            <div
                              key={feature.label}
                              className='rounded-[16px] border border-[var(--color-field-border-muted)] bg-[var(--color-surface)] p-4'
                            >
                              <div className='flex flex-col items-start gap-2'>
                                <span className='flex gap-2 items-center'>
                                  <span className='text-[var(--color-text-primary)]'>
                                    {feature.icon}
                                  </span>
                                  <p className='text-base font-medium leading-4 tracking-[0.02em] text-[var(--color-text-primary)]'>
                                    {feature.label}
                                  </p>
                                </span>
                                <p className='m-0 text-sm leading-[1.75] text-[var(--color-text-secondary)]'>
                                  {feature.description}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>

                  <div className='mt-auto px-2 pt-6'>
                    {renderPlanFooter(config)}
                  </div>
                </div>
              </article>
            )
          })}
        </div>

        <div className='grid gap-4 lg:grid-cols-3'>
          {CREDIT_FACTS.map(fact => (
            <article
              key={fact.title}
              className='rounded-[20px] border-none bg-[var(--color-surface-accent)] p-6 shadow-none'
            >
              <div className='flex flex-col gap-5 text-left'>
                <div className='flex min-h-[196px] items-center justify-center'>
                  {fact.illustration}
                </div>

                <div className='space-y-3'>
                  <p className='m-0 text-[20px] font-medium leading-6 tracking-[0.02em] text-[var(--color-text-primary)]'>
                    {fact.title}
                  </p>
                  <p className='m-0 text-sm leading-[1.75] text-[var(--color-text-secondary)]'>
                    {fact.description}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>

        <section className='border-t border-[var(--color-field-border-muted)] pt-6'>
          <div className='flex flex-col items-center justify-center gap-5 text-center'>
            <p className='m-0 text-[var(--font-size-eyebrow)] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-soft)]'>
              Paiements acceptés
            </p>

            <div className='flex flex-wrap items-center justify-center gap-4'>
              {PAYMENT_METHODS.map(method => (
                <div
                  key={method.alt}
                  className='flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-none bg-white shadow-card'
                >
                  <img
                    src={method.src}
                    alt={method.alt}
                    className='h-full w-full object-cover'
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
