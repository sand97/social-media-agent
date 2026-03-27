import { MessageOutlined } from '@ant-design/icons'
import { CountryPhoneInput } from '@app/components/ui'
import { useAuth } from '@app/hooks/useAuth'
import { getPlanLabel, resolveCurrentPlanKey } from '@app/lib/current-plan'
import {
  getSentryFeedbackConfig,
  sendSupportFeedback,
} from '@app/lib/observability/sentry-feedback'
import { DEFAULT_PHONE_COUNTRY_CODE } from '@app/lib/phone/phone-country-rules'
import {
  buildPhoneE164,
  getCountryPhoneValidationError,
  normalizeCountryPhoneValue,
  resolveCountryIsoCode,
  type CountryPhoneValue,
} from '@app/lib/phone/phone-utils'
import { Alert, App, Button, Form, Input, Modal, Select } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

type SupportFeedbackModalProps = {
  appArea?: string
  description?: string
  initialCategory?: string
  onClose: () => void
  open: boolean
  subject?: string
  title?: string
}

type SupportFormValues = {
  category: string
  message: string
  phone: CountryPhoneValue
}

const CATEGORY_OPTIONS = [
  { label: 'Question produit', value: 'question' },
  { label: 'Bug ou incident', value: 'bug' },
  { label: "Demande d'évolution", value: 'amelioration' },
  { label: 'Upgrade / abonnement', value: 'upgrade' },
]

export function SupportFeedbackModal({
  appArea = 'dashboard-support',
  description = 'Nous vous répondrons dans les 24h',
  initialCategory = 'question',
  onClose,
  open,
  subject,
  title = 'Envoyer nous votre message',
}: SupportFeedbackModalProps) {
  const location = useLocation()
  const { notification } = App.useApp()
  const { user } = useAuth()
  const [form] = Form.useForm<SupportFormValues>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const sentryConfig = getSentryFeedbackConfig()
  const currentPlanKey = useMemo(() => resolveCurrentPlanKey(user), [user])
  const currentPlanLabel = getPlanLabel(currentPlanKey)
  const defaultPhoneCountryCode =
    resolveCountryIsoCode(user?.businessInfo?.country) ??
    DEFAULT_PHONE_COUNTRY_CODE
  const initialPhoneValue = useMemo(
    () =>
      normalizeCountryPhoneValue(user?.phoneNumber, defaultPhoneCountryCode) ?? {
        countryIsoCode: defaultPhoneCountryCode,
        nationalNumber: '',
      },
    [defaultPhoneCountryCode, user?.phoneNumber]
  )

  useEffect(() => {
    if (!open) return

    form.setFieldsValue({
      category: initialCategory,
      message: '',
      phone: initialPhoneValue,
    })
  }, [form, initialCategory, initialPhoneValue, open])

  const handleSubmit = async (values: SupportFormValues) => {
    setIsSubmitting(true)

    try {
      const phoneLabel = buildPhoneE164(values.phone, defaultPhoneCountryCode) || ''
      const fallbackEmail =
        user?.email?.trim() || `${user?.id || 'support'}@whatsapp-agent.local`
      const fallbackName =
        user?.businessInfo?.profile_name ||
        user?.whatsappProfile?.pushname ||
        'Utilisateur WhatsApp Agent'

      const eventId = await sendSupportFeedback({
        category: values.category,
        context: {
          appArea,
          contextScore:
            typeof user?.contextScore === 'number'
              ? String(user.contextScore)
              : undefined,
          currentPlan: currentPlanLabel,
          route: location.pathname,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          url:
            typeof window !== 'undefined'
              ? window.location.href
              : location.pathname,
          userId: user?.id,
        },
        email: fallbackEmail,
        message: `${phoneLabel ? `Téléphone de rappel : ${phoneLabel}\n\n` : ''}${values.message.trim()}`,
        name: fallbackName,
        subject: subject?.trim(),
      })

      notification.success({
        message: 'Message envoyé',
        description: `Référence support : ${eventId}`,
      })

      onClose()
    } catch (error) {
      notification.error({
        message: 'Envoi impossible',
        description:
          error instanceof Error
            ? error.message
            : "Le retour n'a pas pu être envoyé.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={[
        <Button key='cancel' onClick={onClose}>
          Annuler
        </Button>,
        <Button
          key='submit'
          type='primary'
          loading={isSubmitting}
          disabled={!sentryConfig.enabled}
          icon={<MessageOutlined />}
          iconPosition='end'
          onClick={() => form.submit()}
        >
          Envoyer
        </Button>,
      ]}
      width={520}
      closeIcon={null}
      rootClassName='app-double-modal'
      title={
        <div className='space-y-2 pr-8'>
          <h2 className='m-0 text-[var(--font-size-title-sm)] font-semibold text-[var(--color-text-primary)]'>
            {title}
          </h2>
          <p className='m-0 text-base font-normal text-[var(--color-text-secondary)]'>
            {description}
          </p>
        </div>
      }
    >
      <div className='space-y-4'>
        {!sentryConfig.enabled ? (
          <Alert
            type='warning'
            showIcon
            message='Configuration Sentry frontend manquante'
            description={
              sentryConfig.reason === 'invalid_dsn'
                ? 'VITE_SENTRY_DSN est présent mais invalide. Corrigez la variable pour activer le formulaire.'
                : "Renseignez VITE_SENTRY_DSN dans la configuration frontend pour permettre l'envoi de feedback."
            }
          />
        ) : null}

        <Form<SupportFormValues>
          form={form}
          layout='vertical'
          onFinish={handleSubmit}
          initialValues={{
            category: initialCategory,
            phone: initialPhoneValue,
          }}
        >
          <Form.Item
            name='phone'
            className='auth-phone-field support-phone-field'
            rules={[
              {
                validator: (_, value?: CountryPhoneValue) => {
                  const error = getCountryPhoneValidationError(value, {
                    defaultCountryCode: defaultPhoneCountryCode,
                    requiredMessage: 'Veuillez entrer votre numéro.',
                  })

                  return error
                    ? Promise.reject(new Error(error))
                    : Promise.resolve()
                },
              },
            ]}
          >
            <CountryPhoneInput defaultCountryCode={defaultPhoneCountryCode} />
          </Form.Item>

          <Form.Item
            label='Catégorie'
            name='category'
            rules={[
              {
                required: true,
                message: 'Sélectionnez un type de demande.',
              },
            ]}
          >
            <Select options={CATEGORY_OPTIONS} />
          </Form.Item>

          <Form.Item
            label='Votre message'
            name='message'
            rules={[
              { required: true, message: 'Précisez votre message.' },
              {
                min: 20,
                message:
                  'Ajoutez un peu plus de contexte (20 caractères minimum).',
              },
            ]}
          >
            <Input.TextArea
              rows={6}
              placeholder='S’adapter à au client'
              showCount
              maxLength={2000}
            />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  )
}
