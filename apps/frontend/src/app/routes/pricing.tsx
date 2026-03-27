import {
  ArrowRightOutlined,
  CheckCircleFilled,
  CreditCardOutlined,
  MobileOutlined,
} from '@ant-design/icons'
import { DashboardHeader } from '@app/components/layout'
import { CountryPhoneInput } from '@app/components/ui'
import { useAuth } from '@app/hooks/useAuth'
import {
  getAnalyticsPagePath,
  trackEvent,
  trackEventOnce,
} from '@app/lib/analytics/google-analytics'
import {
  createCheckoutSession,
  type BillingPaymentMethod,
  type BillingProvider,
  type BillingPlanKey,
} from '@app/lib/api/billing'
import { resolveCurrentPlanKey } from '@app/lib/current-plan'
import { DEFAULT_PHONE_COUNTRY_CODE } from '@app/lib/phone/phone-country-rules'
import {
  buildPhoneE164,
  getCountryPhoneValidationError,
  normalizeCountryPhoneValue,
  type CountryPhoneValue,
} from '@app/lib/phone/phone-utils'
import { App, Button, Form, Modal, Radio, Segmented } from 'antd'
import FormItem from 'antd/es/form/FormItem'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'

import {
  BILLING_OPTIONS,
  CREDIT_FACTS,
  DURATION_DISCOUNT,
  formatCreditsAmount,
  PLAN_CONTENT,
  PLAN_ORDER,
  formatDisplayPrice,
  getDisplayedMonthlyPrice,
  getPlanLabel,
  getTotalPrice,
  type BillingDuration,
} from '../components/pricing/constants'
import { CreditFactCard } from '../components/pricing/CreditFactCard'
import { PaymentMethodsSection } from '../components/pricing/PaymentMethodsSection'
import { PlanCard } from '../components/pricing/PlanCard'

const LAST_PHONE_KEY = 'whatsapp-agent-last-phone'
const LAST_CHECKOUT_SELECTION_KEY = 'whatsapp-agent-last-checkout-selection'

type CheckoutFormValues = {
  phone: CountryPhoneValue
}

type LastCheckoutSelection = {
  amount?: number
  creditsAmount?: number
  currency?: string
  duration: BillingDuration
  paymentMethod: BillingPaymentMethod
  planKey: BillingPlanKey
  provider?: BillingProvider
  reference?: string
}

type PaymentResultStatus = 'cancelled' | 'failed' | 'pending' | 'success'

type PaymentResultState = {
  provider?: string | null
  reason?: string | null
  reference?: string | null
  status: PaymentResultStatus
}

function isCameroonEligible(user: ReturnType<typeof useAuth>['user']) {
  const phoneNumber = user?.phoneNumber || ''
  const country = `${user?.businessInfo?.country || ''}`.toLowerCase()

  return (
    phoneNumber.startsWith('+237') ||
    country === 'cm' ||
    country.includes('camer')
  )
}

function getPaymentMethodLabel(provider?: string | null) {
  if (provider === 'stripe') {
    return 'carte'
  }

  if (provider === 'notch_pay') {
    return 'Mobile Money'
  }

  return 'paiement'
}

function buildPaymentResultState(input: {
  payment: PaymentResultStatus
  provider?: string | null
  reason?: string | null
  reference?: string | null
}): PaymentResultState {
  return {
    provider: input.provider,
    reason: input.reason,
    reference: input.reference,
    status: input.payment,
  }
}

function formatCreditsCount(value: number) {
  return value.toLocaleString('fr-FR')
}

function getCreditsRemaining(user: ReturnType<typeof useAuth>['user']) {
  if (
    typeof user?.subscription?.creditsIncluded === 'number' &&
    typeof user?.subscription?.creditsUsed === 'number'
  ) {
    return Math.max(
      user.subscription.creditsIncluded - user.subscription.creditsUsed,
      0
    )
  }

  if (typeof user?.credits === 'number') {
    return Math.max(user.credits, 0)
  }

  return null
}

function getAnalyticsPaymentType(paymentMethod: BillingPaymentMethod) {
  return paymentMethod === 'CARD' ? 'card' : 'mobile_money'
}

function getAnalyticsProvider(provider?: BillingProvider | string | null) {
  if (!provider) {
    return undefined
  }

  return provider.toString().toLowerCase()
}

function buildCheckoutAnalyticsItem(input: {
  amount?: number
  duration: BillingDuration
  planKey: BillingPlanKey
}) {
  return {
    item_category: 'subscription',
    item_id: `${input.planKey}_${input.duration}m`,
    item_name: getPlanLabel(input.planKey),
    item_variant: `${input.duration}_months`,
    price: input.amount,
    quantity: 1,
  }
}

function readLastCheckoutSelection() {
  if (typeof window === 'undefined') {
    return null
  }

  const rawSelection = window.localStorage.getItem(LAST_CHECKOUT_SELECTION_KEY)

  if (!rawSelection) {
    return null
  }

  try {
    return JSON.parse(rawSelection) as LastCheckoutSelection
  } catch {
    return null
  }
}

function persistLastCheckoutSelection(selection: LastCheckoutSelection) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(
    LAST_CHECKOUT_SELECTION_KEY,
    JSON.stringify(selection)
  )
}

function PaymentChoiceCard({
  active,
  description,
  disabled,
  icon,
  title,
  onClick,
}: {
  active: boolean
  description: string
  disabled?: boolean
  icon: ReactNode
  title: string
  onClick: () => void
}) {
  return (
    <button
      type='button'
      disabled={disabled}
      onClick={onClick}
      style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
      className={`group w-full appearance-none rounded-[20px] border bg-white p-5 text-left transition focus:outline-none ${
        disabled
          ? 'cursor-not-allowed border-transparent shadow-card opacity-55'
          : active
            ? 'cursor-pointer border-[#111b21] shadow-none'
            : 'cursor-pointer border-transparent shadow-card hover:border-transparent hover:bg-white hover:shadow-[var(--shadow-card),0_0_0_1px_#111b21] focus:border-transparent focus:bg-white focus:shadow-[var(--shadow-card),0_0_0_1px_#111b21]'
      }`}
    >
      <div className='pointer-events-none flex items-start justify-between gap-4'>
        <div className='flex min-w-0 items-start gap-4'>
          <div className='flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-surface-accent)] text-[22px] text-[var(--color-text-primary)]'>
            {icon}
          </div>
          <div className='min-w-0'>
            <div className='flex items-center gap-2'>
              <p className='m-0 text-base font-semibold text-[var(--color-text-primary)]'>
                {title}
              </p>
            </div>
            <p className='mt-2 mb-0 text-sm leading-6 text-[var(--color-text-secondary)]'>
              {description}
            </p>
          </div>
        </div>

        <Radio
          checked={active}
          disabled={disabled}
          className='pointer-events-none'
        />
      </div>
    </button>
  )
}

export function meta() {
  return [
    { title: 'Souscriptions - WhatsApp Agent' },
    {
      name: 'description',
      content: 'Choisissez une souscription WhatsApp Agent',
    },
  ]
}

export default function PricingPage() {
  const { notification } = App.useApp()
  const { user, checkAuth, isLoading } = useAuth()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [form] = Form.useForm<CheckoutFormValues>()
  const [duration, setDuration] = useState<BillingDuration>(6)
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false)
  const [selectedPlanKey, setSelectedPlanKey] = useState<BillingPlanKey | null>(
    null
  )
  const [paymentMethod, setPaymentMethod] =
    useState<BillingPaymentMethod>('CARD')
  const [paymentResult, setPaymentResult] = useState<PaymentResultState | null>(
    null
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const trackedPricingViewRef = useRef<string | null>(null)
  const paymentSearchKey = searchParams.toString()

  const currentPlan = useMemo(() => resolveCurrentPlanKey(user), [user])
  const mobileMoneyEnabled = useMemo(() => isCameroonEligible(user), [user])
  const creditsRemaining = getCreditsRemaining(user)
  const selectedPlan = selectedPlanKey ? PLAN_CONTENT[selectedPlanKey] : null
  const selectedPlanLabel = selectedPlanKey ? getPlanLabel(selectedPlanKey) : ''
  const selectedPlanTotal = selectedPlan
    ? formatDisplayPrice(getTotalPrice(selectedPlan.monthlyPrice, duration))
    : null
  const selectedPlanMonthly = selectedPlan
    ? formatDisplayPrice(
        getDisplayedMonthlyPrice(selectedPlan.monthlyPrice, duration),
        1
      )
    : null
  const selectedPlanCredits = selectedPlan?.monthlyCredits
    ? formatCreditsAmount(selectedPlan.monthlyCredits * duration)
    : null
  const paymentResultContent = useMemo(() => {
    if (!paymentResult) {
      return null
    }

    const paymentLabel = getPaymentMethodLabel(paymentResult.provider)
    const totalCredits =
      typeof user?.subscription?.creditsIncluded === 'number'
        ? user.subscription.creditsIncluded
        : typeof user?.credits === 'number'
          ? user.credits
          : null

    if (paymentResult.status === 'success') {
      return {
        actionLabel: 'Continuer',
        primaryText: 'Votre souscription est maintenant active.',
        secondaryText:
          totalCredits !== null
            ? `Vous avez maintenant accès à ${formatCreditsCount(totalCredits)} crédits. Quand ils se terminent, vous pourrez en racheter à tout moment.`
            : 'Vos crédits viennent d’être ajoutés à votre compte. Quand ils se terminent, vous pourrez en racheter à tout moment.',
        showSuccessIcon: true,
        title: 'Paiement confirmé',
      }
    }

    if (paymentResult.status === 'pending') {
      return {
        actionLabel: 'Compris',
        primaryText:
          'Nous n’avons pas encore reçu la confirmation finale de votre paiement.',
        secondaryText:
          'Si le débit est validé, vos crédits seront ajoutés automatiquement dès réception de la confirmation.',
        showSuccessIcon: false,
        title: 'Paiement en cours de vérification',
      }
    }

    const failureDescriptionByReason: Record<string, string> = {
      expired:
        'La session de paiement a expiré avant confirmation. Vous pouvez relancer un nouveau paiement.',
      missing_session:
        'Le provider est revenu sans session exploitable. Nous n’avons pas pu vérifier le paiement.',
      no_reference:
        'Le provider est revenu sans référence exploitable. Nous n’avons pas pu rapprocher le paiement.',
      payment_not_found:
        'Le retour du provider a bien été reçu, mais aucune transaction locale correspondante n’a été retrouvée.',
      reference_mismatch:
        'Les références reçues par le backend ne correspondent pas à la transaction attendue.',
      server_error:
        'Nous n’avons pas pu vérifier automatiquement votre paiement après le retour du provider.',
    }

    return {
      actionLabel: 'Réessayer',
      primaryText:
        paymentResult.status === 'cancelled'
          ? `Le paiement par ${paymentLabel} a été interrompu avant confirmation.`
          : (paymentResult.reason &&
              failureDescriptionByReason[paymentResult.reason]) ||
            'La transaction n’a pas pu être validée.',
      secondaryText:
        'Vous pouvez relancer le paiement maintenant. Si vous avez été débité, vos crédits seront ajoutés dès réception de la confirmation.',
      showSuccessIcon: false,
      title:
        paymentResult.status === 'cancelled'
          ? 'Paiement annulé'
          : 'Impossible de vérifier le paiement',
    }
  }, [paymentResult, user])

  useEffect(() => {
    if (isLoading) {
      return
    }

    const trackingPath = getAnalyticsPagePath(location)
    if (trackedPricingViewRef.current === trackingPath) {
      return
    }

    trackedPricingViewRef.current = trackingPath

    trackEvent('pricing_page_view', {
      credits_remaining: creditsRemaining ?? undefined,
      current_plan: currentPlan,
      is_authenticated: Boolean(user),
    })
  }, [creditsRemaining, currentPlan, isLoading, location, user])

  useEffect(() => {
    if (!paymentResult || paymentResult.status !== 'success') {
      return
    }

    const selection = readLastCheckoutSelection()
    const transactionId = paymentResult.reference || selection?.reference
    const provider =
      getAnalyticsProvider(paymentResult.provider) ||
      getAnalyticsProvider(selection?.provider)
    const purchaseParams = {
      billing_duration_months: selection?.duration,
      credits_amount: selection?.creditsAmount,
      credits_remaining_after_purchase: creditsRemaining ?? undefined,
      currency: selection?.currency,
      items: selection
        ? [
            buildCheckoutAnalyticsItem({
              amount: selection.amount,
              duration: selection.duration,
              planKey: selection.planKey,
            }),
          ]
        : undefined,
      payment_method: selection?.paymentMethod,
      payment_provider: provider,
      payment_type: selection
        ? getAnalyticsPaymentType(selection.paymentMethod)
        : undefined,
      plan_key: selection?.planKey,
      transaction_id: transactionId,
      value: selection?.amount,
    }
    const purchaseKey = transactionId
      ? `purchase:${transactionId}`
      : 'purchase:success_without_reference'

    trackEventOnce(purchaseKey, 'purchase', purchaseParams)
    trackEventOnce(
      `payment_success_modal_view:${purchaseKey}`,
      'payment_success_modal_view',
      purchaseParams
    )
  }, [creditsRemaining, paymentResult])

  useEffect(() => {
    if (!isCheckoutModalOpen || typeof window === 'undefined') {
      return
    }

    const savedPhone = window.localStorage.getItem(LAST_PHONE_KEY)
    if (!savedPhone) {
      return
    }

    try {
      const phoneValue = normalizeCountryPhoneValue(
        JSON.parse(savedPhone),
        DEFAULT_PHONE_COUNTRY_CODE
      )

      if (phoneValue) {
        form.setFieldsValue({ phone: phoneValue })
      }
    } catch {
      // Ignore stale local storage values
    }
  }, [form, isCheckoutModalOpen])

  useEffect(() => {
    const currentParams = new URLSearchParams(paymentSearchKey)
    const payment = currentParams.get('payment')
    const provider = currentParams.get('provider')
    const reason = currentParams.get('reason')
    const reference = currentParams.get('reference')

    if (!payment) {
      return
    }

    if (
      payment === 'success' ||
      payment === 'pending' ||
      payment === 'cancelled' ||
      payment === 'failed'
    ) {
      const nextPaymentResult = buildPaymentResultState({
        payment,
        provider,
        reason,
        reference,
      })

      if (payment === 'success') {
        void (async () => {
          await checkAuth()
          setPaymentResult(nextPaymentResult)
        })()
      } else {
        setPaymentResult(nextPaymentResult)
      }
    }

    const next = new URLSearchParams(currentParams)
    next.delete('payment')
    next.delete('provider')
    next.delete('reference')
    next.delete('reason')
    setSearchParams(next, { replace: true })
  }, [checkAuth, paymentSearchKey, setSearchParams])

  function getDiscountContent(selectedDuration: BillingDuration) {
    if (selectedDuration === 1) {
      return (
        <p className='m-0 flex h-[34px] items-center justify-center text-sm text-[var(--color-text-soft)]'>
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

  function openCheckoutModal(planKey: BillingPlanKey) {
    trackEvent('payment_cta_click', {
      billing_duration_months: duration,
      credits_remaining: creditsRemaining ?? undefined,
      current_plan: currentPlan,
      plan_key: planKey,
    })
    trackEvent('begin_checkout', {
      billing_duration_months: duration,
      credits_remaining: creditsRemaining ?? undefined,
      current_plan: currentPlan,
      items: [buildCheckoutAnalyticsItem({ duration, planKey })],
      plan_key: planKey,
    })

    setSelectedPlanKey(planKey)
    setPaymentMethod('CARD')
    setIsCheckoutModalOpen(true)
  }

  function closeCheckoutModal() {
    if (isSubmitting) {
      return
    }

    setIsCheckoutModalOpen(false)
    setSelectedPlanKey(null)
    setPaymentMethod('CARD')
    form.resetFields()
  }

  function closePaymentResultModal() {
    setPaymentResult(null)
  }

  function retryPaymentFromResult() {
    closePaymentResultModal()

    const selection = readLastCheckoutSelection()

    if (!selection) {
      return
    }

    setDuration(selection.duration)
    setSelectedPlanKey(selection.planKey)
    setPaymentMethod(
      selection.paymentMethod === 'MOBILE_MONEY' && !mobileMoneyEnabled
        ? 'CARD'
        : selection.paymentMethod
    )
    setIsCheckoutModalOpen(true)

    trackEvent('begin_checkout', {
      billing_duration_months: selection.duration,
      credits_remaining: creditsRemaining ?? undefined,
      current_plan: currentPlan,
      items: [
        buildCheckoutAnalyticsItem({
          amount: selection.amount,
          duration: selection.duration,
          planKey: selection.planKey,
        }),
      ],
      plan_key: selection.planKey,
      retry_from_payment_result: true,
    })
  }

  function handlePaymentMethodSelection(
    nextPaymentMethod: BillingPaymentMethod
  ) {
    if (
      nextPaymentMethod === 'MOBILE_MONEY' &&
      (!mobileMoneyEnabled || paymentMethod === 'MOBILE_MONEY')
    ) {
      return
    }

    if (nextPaymentMethod === 'CARD' && paymentMethod === 'CARD') {
      return
    }

    setPaymentMethod(nextPaymentMethod)

    trackEvent('payment_method_selected', {
      billing_duration_months: duration,
      credits_remaining: creditsRemaining ?? undefined,
      payment_method: nextPaymentMethod,
      payment_type: getAnalyticsPaymentType(nextPaymentMethod),
      plan_key: selectedPlanKey || undefined,
    })
  }

  async function handleCheckout() {
    if (!selectedPlanKey) {
      return
    }

    let phoneNumber: string | undefined

    if (paymentMethod === 'MOBILE_MONEY') {
      const values = await form.validateFields()
      const formatted = buildPhoneE164(values.phone, DEFAULT_PHONE_COUNTRY_CODE)

      if (!formatted) {
        notification.error({
          message: 'Numéro requis',
          description:
            'Veuillez renseigner un numéro Mobile Money valide au format international.',
        })
        return
      }

      phoneNumber = formatted
    }

    setIsSubmitting(true)

    try {
      persistLastCheckoutSelection({
        duration,
        paymentMethod,
        planKey: selectedPlanKey,
      })

      const checkout = await createCheckoutSession({
        durationMonths: duration,
        paymentMethod,
        phoneNumber,
        planKey: selectedPlanKey,
      })
      const checkoutCreditsAmount = PLAN_CONTENT[selectedPlanKey].monthlyCredits
        ? PLAN_CONTENT[selectedPlanKey].monthlyCredits * duration
        : undefined

      persistLastCheckoutSelection({
        amount: checkout.amount,
        creditsAmount: checkoutCreditsAmount,
        currency: checkout.currency,
        duration,
        paymentMethod,
        planKey: selectedPlanKey,
        provider: checkout.provider,
        reference: checkout.reference,
      })

      const checkoutItem = buildCheckoutAnalyticsItem({
        amount: checkout.amount,
        duration,
        planKey: selectedPlanKey,
      })
      const analyticsParams = {
        billing_duration_months: duration,
        credits_amount: checkoutCreditsAmount,
        credits_remaining: creditsRemaining ?? undefined,
        currency: checkout.currency,
        items: [checkoutItem],
        payment_method: paymentMethod,
        payment_provider: getAnalyticsProvider(checkout.provider),
        payment_type: getAnalyticsPaymentType(paymentMethod),
        plan_key: selectedPlanKey,
        reference: checkout.reference,
        value: checkout.amount,
      }
      let hasRedirected = false

      const redirectToCheckout = () => {
        if (hasRedirected) {
          return
        }

        hasRedirected = true
        window.location.assign(checkout.checkoutUrl)
      }

      trackEvent('add_payment_info', analyticsParams)
      trackEvent('payment_initialized', {
        ...analyticsParams,
        event_callback: redirectToCheckout,
        event_timeout: 1000,
      })

      window.setTimeout(redirectToCheckout, 1200)
    } catch (error) {
      const description =
        error instanceof Error
          ? error.message
          : 'Impossible de démarrer le paiement.'

      notification.error({
        message: 'Checkout indisponible',
        description,
      })
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <DashboardHeader title='Souscriptions' />

      <div className='w-full space-y-8 px-4 py-5 sm:px-6 sm:py-6'>
        <div className='sticky top-10 z-10 -mx-4 mb-8 flex flex-col items-center gap-3 bg-white px-4 py-4 text-center md:relative md:top-0'>
          <Segmented<BillingDuration>
            className='pricing-billing-toggle stats-granularity-toggle'
            value={duration}
            options={BILLING_OPTIONS}
            onChange={value => setDuration(value)}
          />
          {getDiscountContent(duration)}
        </div>

        <div className='grid min-w-0 gap-4 md:flex md:items-stretch md:gap-0 md:-space-x-px'>
          {PLAN_ORDER.map((plan, index) => (
            <PlanCard
              key={plan}
              planKey={plan}
              config={PLAN_CONTENT[plan]}
              isCurrent={currentPlan === plan}
              duration={duration}
              onUpgrade={planKey =>
                openCheckoutModal(planKey as BillingPlanKey)
              }
              isFirst={index === 0}
              isLast={index === PLAN_ORDER.length - 1}
            />
          ))}
        </div>

        <div className='grid gap-4 lg:grid-cols-3'>
          {CREDIT_FACTS.map(fact => (
            <CreditFactCard key={fact.title} fact={fact} />
          ))}
        </div>

        <PaymentMethodsSection />
      </div>

      <Modal
        open={Boolean(paymentResult)}
        onCancel={closePaymentResultModal}
        closeIcon={null}
        width={520}
        rootClassName='app-double-modal'
        footer={[
          <Button
            key='action'
            type='primary'
            onClick={
              paymentResult?.status === 'failed' ||
              paymentResult?.status === 'cancelled'
                ? retryPaymentFromResult
                : closePaymentResultModal
            }
          >
            {paymentResultContent?.actionLabel || 'Fermer'}
          </Button>,
        ]}
        title={
          <div className='flex items-center gap-3'>
            {paymentResultContent?.showSuccessIcon ? (
              <span className='inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#24D3661A] text-[20px] text-[#24D366]'>
                <CheckCircleFilled />
              </span>
            ) : null}
            <h2 className='m-0 text-[length:var(--font-size-title-sm)] font-semibold text-[var(--color-text-primary)]'>
              {paymentResultContent?.title || 'Résultat du paiement'}
            </h2>
          </div>
        }
      >
        {paymentResult && paymentResultContent ? (
          <div className='space-y-4'>
            <p className='m-0 text-sm leading-7 text-[var(--color-text-primary)]'>
              {paymentResultContent.primaryText}
            </p>
            <p className='m-0 text-sm leading-7 text-[var(--color-text-primary)]'>
              {paymentResultContent.secondaryText}
            </p>
            {paymentResult.reference && paymentResult.status !== 'success' ? (
              <p className='m-0 text-xs font-medium tracking-[0.02em] text-[var(--color-text-soft)]'>
                Référence: {paymentResult.reference}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={isCheckoutModalOpen}
        onCancel={closeCheckoutModal}
        width={560}
        closeIcon={null}
        rootClassName='app-double-modal'
        footer={[
          <Button
            key='cancel'
            onClick={closeCheckoutModal}
            disabled={isSubmitting}
          >
            Annuler
          </Button>,
          <Button
            key='submit'
            type='primary'
            onClick={() => void handleCheckout()}
            loading={isSubmitting}
            icon={<ArrowRightOutlined />}
            iconPosition='end'
          >
            {paymentMethod === 'CARD'
              ? 'Payer par carte'
              : 'Payer par Mobile Money'}
          </Button>,
        ]}
        title={
          <h2 className='m-0 text-[length:var(--font-size-title-sm)] font-semibold text-[var(--color-text-primary)]'>
            Choisir un moyen de paiement
          </h2>
        }
      >
        <div className='space-y-5'>
          {selectedPlan ? (
            <div className='flex h-40 flex-col justify-between rounded-2xl bg-[var(--color-surface-accent)] px-5 pb-5 pt-5'>
              <p className='m-0 text-base font-bold leading-4 tracking-[0.02em] text-[var(--color-text-primary)]'>
                {selectedPlanLabel.toUpperCase()}
              </p>

              <div className='flex flex-wrap items-end justify-between gap-4'>
                <div>
                  <span className='text-4xl font-semibold leading-none tracking-tight text-[var(--color-text-primary)]'>
                    {selectedPlanMonthly}
                  </span>
                  <span className='ml-2 text-lg font-normal text-[var(--color-text-secondary)]'>
                    par mois
                  </span>
                  {selectedPlanCredits ? (
                    <p className='mt-3 mb-0 text-sm font-medium leading-6 text-[var(--color-text-secondary)]'>
                      {selectedPlanCredits} crédits inclus sur la période
                    </p>
                  ) : null}
                </div>
                <span className='rounded-full bg-white px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] shadow-card'>
                  Total {selectedPlanTotal}
                </span>
              </div>
            </div>
          ) : null}

          <div className='space-y-3'>
            <PaymentChoiceCard
              active={paymentMethod === 'CARD'}
              title='Carte'
              icon={<CreditCardOutlined />}
              description='Visa / Mastercard'
              onClick={() => handlePaymentMethodSelection('CARD')}
            />

            <PaymentChoiceCard
              active={paymentMethod === 'MOBILE_MONEY'}
              disabled={!mobileMoneyEnabled}
              title='Mobile Money'
              icon={<MobileOutlined />}
              description={
                mobileMoneyEnabled
                  ? 'Orange Money / MTN Mobile Money'
                  : 'Disponible uniquement pour les numéros du Cameroun.'
              }
              onClick={() => handlePaymentMethodSelection('MOBILE_MONEY')}
            />
          </div>

          {paymentMethod === 'MOBILE_MONEY' ? (
            <Form form={form} layout='vertical'>
              <FormItem
                label='Numéro Mobile Money'
                name='phone'
                className='auth-phone-field w-full'
                rules={[
                  {
                    validator: (_, value?: CountryPhoneValue) => {
                      const error = getCountryPhoneValidationError(value, {
                        defaultCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
                        requiredMessage: 'Veuillez entrer votre numéro.',
                      })

                      return error
                        ? Promise.reject(new Error(error))
                        : Promise.resolve()
                    },
                  },
                ]}
              >
                <CountryPhoneInput
                  defaultCountryCode={DEFAULT_PHONE_COUNTRY_CODE}
                />
              </FormItem>
              <p className='m-0 text-sm leading-6 text-[var(--color-text-secondary)]'>
                Nous utiliserons ce numéro pour préremplir la page de paiement
                et limiter le paiement au Cameroun.
              </p>
            </Form>
          ) : null}
        </div>
      </Modal>
    </>
  )
}
