import {
  ArrowRightOutlined,
  CheckCircleFilled,
  CreditCardOutlined,
  MobileOutlined,
} from '@ant-design/icons'
import { DashboardHeader } from '@app/components/layout'
import { useAuth } from '@app/hooks/useAuth'
import {
  createCheckoutSession,
  type BillingPaymentMethod,
  type BillingPlanKey,
} from '@app/lib/api/billing'
import { resolveCurrentPlanKey } from '@app/lib/current-plan'
import { App, Button, Form, Modal, Radio, Segmented } from 'antd'
import FormItem from 'antd/es/form/FormItem'
import PhoneInput, { type PhoneNumber } from 'antd-phone-input'
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'react-router-dom'

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
  phone: PhoneNumber
}

type LastCheckoutSelection = {
  duration: BillingDuration
  paymentMethod: BillingPaymentMethod
  planKey: BillingPlanKey
}

type PaymentResultStatus = 'cancelled' | 'failed' | 'pending' | 'success'

type PaymentResultState = {
  provider?: string | null
  reason?: string | null
  reference?: string | null
  status: PaymentResultStatus
}

function getPhoneCountryLabel(value: PhoneNumber | string | undefined) {
  const fallbackLabel = 'Cameroun'

  if (typeof value === 'object' && value?.isoCode) {
    try {
      return (
        new Intl.DisplayNames(['fr-FR'], { type: 'region' }).of(
          value.isoCode.toUpperCase()
        ) || fallbackLabel
      )
    } catch {
      return fallbackLabel
    }
  }

  return fallbackLabel
}

function buildPhoneNumber(value?: PhoneNumber) {
  if (!value?.phoneNumber) {
    return null
  }

  return `+${value.countryCode}${value.areaCode}${value.phoneNumber}`
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
  const { user, checkAuth } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [form] = Form.useForm<CheckoutFormValues>()
  const phoneFieldValue = Form.useWatch('phone', form)
  const phoneCountryLabel = getPhoneCountryLabel(phoneFieldValue)
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
  const paymentSearchKey = searchParams.toString()

  const currentPlan = useMemo(() => resolveCurrentPlanKey(user), [user])
  const mobileMoneyEnabled = useMemo(() => isCameroonEligible(user), [user])
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
    if (!isCheckoutModalOpen || typeof window === 'undefined') {
      return
    }

    const savedPhone = window.localStorage.getItem(LAST_PHONE_KEY)
    if (!savedPhone) {
      return
    }

    try {
      const phoneValue = JSON.parse(savedPhone) as PhoneNumber
      form.setFieldsValue({ phone: phoneValue })
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

    if (typeof window === 'undefined') {
      return
    }

    const rawSelection = window.localStorage.getItem(
      LAST_CHECKOUT_SELECTION_KEY
    )

    if (!rawSelection) {
      return
    }

    try {
      const selection = JSON.parse(rawSelection) as LastCheckoutSelection
      setDuration(selection.duration)
      setSelectedPlanKey(selection.planKey)
      setPaymentMethod(
        selection.paymentMethod === 'MOBILE_MONEY' && !mobileMoneyEnabled
          ? 'CARD'
          : selection.paymentMethod
      )
      setIsCheckoutModalOpen(true)
    } catch {
      // Ignore stale local storage values
    }
  }

  async function handleCheckout() {
    if (!selectedPlanKey) {
      return
    }

    let phoneNumber: string | undefined

    if (paymentMethod === 'MOBILE_MONEY') {
      const values = await form.validateFields()
      const formatted = buildPhoneNumber(values.phone)

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
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          LAST_CHECKOUT_SELECTION_KEY,
          JSON.stringify({
            duration,
            paymentMethod,
            planKey: selectedPlanKey,
          } satisfies LastCheckoutSelection)
        )
      }

      const checkout = await createCheckoutSession({
        durationMonths: duration,
        paymentMethod,
        phoneNumber,
        planKey: selectedPlanKey,
      })

      window.location.assign(checkout.checkoutUrl)
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
              onClick={() => setPaymentMethod('CARD')}
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
              onClick={() => {
                if (mobileMoneyEnabled) {
                  setPaymentMethod('MOBILE_MONEY')
                }
              }}
            />
          </div>

          {paymentMethod === 'MOBILE_MONEY' ? (
            <Form form={form} layout='vertical'>
              <FormItem
                label='Numéro Mobile Money'
                name='phone'
                className='auth-phone-field w-full'
                style={
                  {
                    '--phone-country-label': `"${phoneCountryLabel}"`,
                  } as CSSProperties
                }
                rules={[
                  { required: true, message: 'Veuillez entrer votre numéro' },
                ]}
              >
                <PhoneInput
                  country='cm'
                  enableSearch
                  enableArrow
                  disableParentheses
                  preferredCountries={['cm']}
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
