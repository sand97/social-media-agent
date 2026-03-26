import { ArrowRightOutlined } from '@ant-design/icons'
import MoreDownIcon from '@app/assets/MoreDown.svg?react'
import type { PlanKey } from '@app/lib/current-plan'
import { Button } from 'antd'

import {
  formatCreditsAmount,
  formatDisplayPrice,
  getDisplayedMonthlyPrice,
  getPlanCreditsSummary,
  getDurationCtaLabel,
  getPlanLabel,
  getTotalPrice,
  type BillingDuration,
  type PlanConfig,
} from './constants'

function renderPlanFooter(config: PlanConfig, duration: BillingDuration) {
  const creditSummary = getPlanCreditsSummary(config, duration)

  if (!config.overagePrice) {
    return (
      <p className='m-0 text-[0px] leading-none tracking-[0.02em]'>
        <span className='text-[18px] font-bold text-[var(--color-text-primary)]'>
          {creditSummary.amount}
        </span>
        <span className='ml-1 text-[16px] font-normal text-[var(--color-text-secondary)]'>
          {creditSummary.suffix}
        </span>
      </p>
    )
  }

  return (
    <div className='space-y-0.5 text-[16px] leading-[1.8] tracking-[0.02em] text-[var(--color-text-secondary)]'>
      <p className='m-0'>
        <span className='text-[18px] font-bold text-[var(--color-text-primary)]'>
          {creditSummary.amount}
        </span>
        <span className='ml-1'>{creditSummary.suffix}</span>
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

type PlanCardProps = {
  planKey: PlanKey
  config: PlanConfig
  isCurrent: boolean
  duration: BillingDuration
  onUpgrade: (planKey: PlanKey) => void
  isFirst: boolean
  isLast: boolean
}

export function PlanCard({
  planKey,
  config,
  isCurrent,
  duration,
  onUpgrade,
  isFirst,
  isLast,
}: PlanCardProps) {
  const planLabel = getPlanLabel(planKey)
  const displayPrice = formatDisplayPrice(
    getDisplayedMonthlyPrice(config.monthlyPrice, duration),
    1
  )
  const totalPrice = formatDisplayPrice(
    getTotalPrice(config.monthlyPrice, duration)
  )
  const totalCredits = config.monthlyCredits
    ? formatCreditsAmount(config.monthlyCredits * duration)
    : null

  const radiusClass = isFirst
    ? 'md:rounded-l-[20px] md:rounded-r-none'
    : isLast
      ? 'md:rounded-r-[20px] md:rounded-l-none'
      : 'md:rounded-none'

  return (
    <article
      className={`relative min-w-0 rounded-[20px] border border-[var(--color-field-border-muted)] bg-white p-4 shadow-none md:flex md:flex-1 md:flex-col md:p-4 ${radiusClass}`}
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

          {totalCredits ? (
            <p className='m-0 text-sm font-medium leading-6 text-[var(--color-text-secondary)]'>
              {totalCredits} crédits inclus sur la période
            </p>
          ) : null}
        </div>

        <div className='md:sticky md:top-14 md:z-20 md:-mx-4 md:-mb-5 md:bg-white md:px-4 md:pb-5'>
          <div className='pointer-events-none absolute inset-x-0 bottom-full hidden h-4 bg-white md:block' />
          <div>
            {isCurrent ? (
              <div className='pricing-current-button'>Votre forfait actuel</div>
            ) : config.ctaLabel ? (
              <Button
                className='dark-button w-full'
                icon={<ArrowRightOutlined />}
                iconPosition='end'
                onClick={() => onUpgrade(planKey)}
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

        <div className='mt-auto px-2 pt-6'>{renderPlanFooter(config, duration)}</div>
      </div>
    </article>
  )
}
