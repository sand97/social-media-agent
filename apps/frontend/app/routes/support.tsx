import {
  CustomerServiceOutlined,
  MessageOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'
import { DashboardHeader } from '@app/components/layout'
import { ActionCard } from '@app/components/ui'
import { useAuth } from '@app/hooks/useAuth'
import { getPlanLabel, resolveCurrentPlanKey } from '@app/lib/current-plan'
import {
  getSentryFeedbackConfig,
  sendSupportFeedback,
} from '@app/lib/observability/sentry-feedback'
import { Alert, App, Button, Form, Input, Modal, Select } from 'antd'
import PhoneInput, { type PhoneNumber } from 'antd-phone-input'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

type SupportLocationState = {
  category?: string
  subject?: string
}

type SupportFormValues = {
  category: string
  message: string
  phone: PhoneNumber | string
}

const CATEGORY_OPTIONS = [
  { label: 'Question produit', value: 'question' },
  { label: 'Bug ou incident', value: 'bug' },
  { label: "Demande d'évolution", value: 'amelioration' },
  { label: 'Upgrade / abonnement', value: 'upgrade' },
]

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

export function meta() {
  return [
    { title: 'Support - WhatsApp Agent' },
    {
      name: 'description',
      content:
        'Point d’entrée support avec FAQ, assistance IA et formulaire Sentry',
    },
  ]
}

export default function SupportPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { notification } = App.useApp()
  const { user } = useAuth()
  const state = (location.state || {}) as SupportLocationState
  const [form] = Form.useForm<SupportFormValues>()
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const sentryConfig = getSentryFeedbackConfig()
  const currentPlanKey = useMemo(() => resolveCurrentPlanKey(user), [user])
  const currentPlanLabel = getPlanLabel(currentPlanKey)
  const phoneFieldValue = Form.useWatch('phone', form)
  const phoneCountryLabel = getPhoneCountryLabel(phoneFieldValue)

  useEffect(() => {
    form.setFieldsValue({
      category: state.category || 'question',
      message: '',
      phone: user?.phoneNumber || '',
    })
  }, [form, state.category, user?.phoneNumber])

  const handleOpenContactModal = () => {
    setContactModalOpen(true)
  }

  const handleCloseContactModal = () => {
    setContactModalOpen(false)
  }

  const handleSubmit = async (values: SupportFormValues) => {
    setIsSubmitting(true)

    try {
      const phoneValue =
        typeof values.phone === 'string' ? null : values.phone || null
      const phoneLabel = phoneValue
        ? `+${phoneValue.countryCode || ''}${phoneValue.areaCode || ''}${
            phoneValue.phoneNumber || ''
          }`.trim()
        : ''
      const fallbackEmail =
        user?.email?.trim() || `${user?.id || 'support'}@whatsapp-agent.local`
      const fallbackName =
        user?.businessInfo?.profile_name ||
        user?.whatsappProfile?.pushname ||
        'Utilisateur WhatsApp Agent'

      const eventId = await sendSupportFeedback({
        category: values.category,
        context: {
          appArea: 'dashboard-support',
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
        subject: state.subject?.trim(),
      })

      notification.success({
        message: 'Message envoyé',
        description: `Référence support : ${eventId}`,
      })

      form.setFieldsValue({
        category: state.category || 'question',
        message: '',
        phone: user?.phoneNumber || '',
      })
      setContactModalOpen(false)
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
    <>
      <DashboardHeader title='Support et Aides' />

      <div className='w-full space-y-4 px-4 py-5 sm:px-6 sm:py-6'>
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

        <div className='merge-border-radius grid gap-2'>
          <ActionCard
            title='Lire nos questions reponses'
            subtitle='Consulter les questions les plus souvent poser par les clients et leurs réponses'
            actionLabel='Lire la FAQ'
            icon={<QuestionCircleOutlined />}
            onAction={() => navigate('/faq')}
          />

          <ActionCard
            title='Discuter avec un de nos agent IA'
            subtitle='Obtenez une réponse instantanée d’un agent qui maitrise parfaitement votre entreprise'
            actionLabel='Poser une question'
            icon={<MessageOutlined />}
            onAction={() => navigate('/context')}
          />

          <ActionCard
            title='Discuter avec un membre du support'
            subtitle='Envoyer nous un message pour recevoir une réponse dans les 24h au plus tard'
            actionLabel='Envoyer un message'
            icon={<CustomerServiceOutlined />}
            onAction={handleOpenContactModal}
          />
        </div>
      </div>

      <Modal
        open={contactModalOpen}
        onCancel={handleCloseContactModal}
        footer={[
          <Button key='cancel' onClick={handleCloseContactModal}>
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
              Envoyer nous votre message
            </h2>
            <p className='m-0 text-base font-normal text-[var(--color-text-secondary)]'>
              Nous vous répondrons dans les 24h
            </p>
          </div>
        }
      >
        <Form<SupportFormValues>
          form={form}
          layout='vertical'
          onFinish={handleSubmit}
          initialValues={{
            category: state.category || 'question',
            phone: user?.phoneNumber || '',
          }}
        >
          <Form.Item
            name='phone'
            className='auth-phone-field support-phone-field'
            style={
              {
                '--phone-country-label': `"${phoneCountryLabel}"`,
              } as CSSProperties
            }
            rules={[
              { required: true, message: 'Veuillez entrer votre numéro.' },
              {
                validator: (_, value?: PhoneNumber) => {
                  const normalizedValue =
                    typeof value === 'string' ? null : value || null

                  if (!normalizedValue?.phoneNumber) {
                    return Promise.reject(
                      new Error('Veuillez entrer votre numéro.')
                    )
                  }
                  return Promise.resolve()
                },
              },
            ]}
          >
            <PhoneInput
              country='cm'
              enableSearch
              enableArrow
              disableParentheses
              preferredCountries={['cm']}
            />
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
      </Modal>
    </>
  )
}
