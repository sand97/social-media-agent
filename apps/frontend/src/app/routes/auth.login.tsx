import {
  ArrowRightOutlined,
  CustomerServiceOutlined,
  DollarOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'
import { CountryPhoneInput } from '@app/components/ui'
import { featuresConfig } from '@app/data/features'
import { useAuth } from '@app/hooks/useAuth'
import { trackFirstLoginSignUp } from '@app/lib/analytics/google-analytics'
import apiClient from '@app/lib/api/client'
import { DEFAULT_PHONE_COUNTRY_CODE } from '@app/lib/phone/phone-country-rules'
import {
  buildPhoneE164,
  getCountryPhoneValidationError,
  normalizeCountryPhoneValue,
  type CountryPhoneValue,
} from '@app/lib/phone/phone-utils'
import { App, Button, Modal, Spin, Typography } from 'antd'
import Form from 'antd/es/form'
import FormItem from 'antd/es/form/FormItem'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const { Text, Link } = Typography

const LAST_PHONE_KEY = 'whatsapp-agent-last-phone'

interface FormValues {
  phone: CountryPhoneValue
}

export function meta() {
  return [
    { title: 'Connexion - WhatsApp Agent' },
    {
      name: 'description',
      content: 'Connectez-vous avec votre numéro WhatsApp Business',
    },
  ]
}

// Fonction pour détecter si l'utilisateur est sur mobile (basée sur la largeur du navigateur)
function isMobileDevice() {
  return window.innerWidth < 768 // Mobile si largeur < 768px (breakpoint standard)
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { notification } = App.useApp()
  const { login } = useAuth()
  const [form] = Form.useForm<FormValues>()
  const [isLoading, setIsLoading] = useState(false)
  const [selectedFeatureKey, setSelectedFeatureKey] = useState<string | null>(
    null
  )
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [pairingToken, setPairingToken] = useState<string | null>(null)
  const [qrSessionToken, setQrSessionToken] = useState<string | null>(null)
  const [isQrMode, setIsQrMode] = useState(false)
  const [isMobile] = useState(isMobileDevice())
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [isPolling, setIsPolling] = useState(false)

  // Récupérer la feature sélectionnée depuis la config
  const selectedFeature = selectedFeatureKey
    ? Object.values(featuresConfig)
        .flatMap(category => category.features)
        .find(f => `${f.title}` === selectedFeatureKey)
    : null

  // Polling for QR code status and authentication check
  useEffect(() => {
    if (!pairingToken || !qrSessionToken || !isQrMode) return

    const checkQRStatus = async () => {
      setIsPolling(true)
      try {
        const response = await apiClient.post('/auth/refresh-qr', {
          pairingToken,
          qrSessionToken,
        })

        if (response.status === 201 || response.status === 200) {
          // Scenario 1: User is already connected
          if (response.data.scenario === 'connected') {
            console.log('✅ User is already connected')
            notification.success({
              message: 'Connexion réussie',
              description: 'Vous allez être redirigé...',
            })

            // Stop polling
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current)
              pollingIntervalRef.current = null
            }

            // Login and redirect
            if (response.data.accessToken) {
              trackFirstLoginSignUp({
                authFlow: 'qr',
                isFirstLogin: Boolean(response.data.isFirstLogin),
                userId: response.data.user?.id,
              })
              login(response.data.user)

              setTimeout(() => {
                navigate(response.data.redirectTo || '/context')
              }, 1000)
            }
            return
          }

          // Scenario 2: New QR code received
          if (response.data.qrCode) {
            console.log('🔄 Received new QR code')
            setQrCode(response.data.qrCode)

            // Update qrSessionToken if provided
            if (response.data.qrSessionToken) {
              setQrSessionToken(response.data.qrSessionToken)
            }
          }

          // Scenario 3: Waiting for connection
          if (!response.data.qrCode && !response.data.scenario) {
            console.log('⏳ Waiting for connection confirmation...')
          }
        }
      } catch (error: unknown) {
        const err = error as { response?: { data?: { message?: string } } }
        console.error('Error checking QR status:', err)

        // Only show error if it's not a token expiration
        if (!err.response?.data?.message?.includes('expired')) {
          console.error('QR status check error:', err.response?.data?.message)
        }
      } finally {
        setIsPolling(false)
      }
    }

    // Initial check
    checkQRStatus()

    // Start polling every 5 seconds
    pollingIntervalRef.current = setInterval(checkQRStatus, 5000)

    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [pairingToken, qrSessionToken, isQrMode, navigate, notification, login])

  const handleContinue = async (values: FormValues) => {
    const { phone } = values
    const fullPhoneNumber = buildPhoneE164(phone, DEFAULT_PHONE_COUNTRY_CODE)

    if (!fullPhoneNumber) {
      notification.error({
        message: 'Erreur',
        description: 'Veuillez entrer un numéro de téléphone valide',
      })
      return
    }

    setIsLoading(true)

    try {
      // Détecter le type d'appareil
      const deviceType = isMobile ? 'mobile' : 'desktop'

      // Appel unifié pour tous les scénarios
      const response = await apiClient.post('/auth/request-pairing', {
        phoneNumber: fullPhoneNumber,
        deviceType,
      })

      if (response.status === 201 || response.status === 200) {
        // Save phone for later
        localStorage.setItem(LAST_PHONE_KEY, JSON.stringify(phone))

        const { scenario, pairingToken, code, qrSessionToken } = response.data

        // Scénario 1: OTP (utilisateur déjà connecté)
        if (scenario === 'otp') {
          notification.success({
            message: 'Code envoyé',
            description:
              'Un code de vérification a été envoyé sur votre WhatsApp',
          })
          navigate('/auth/verify-otp', {
            state: {
              phoneNumber: fullPhoneNumber,
              pairingToken,
              scenario: 'otp',
            },
          })
          return
        }

        // Scénario 2: Pairing (mobile, nouvel utilisateur)
        if (scenario === 'pairing') {
          notification.success({
            message: 'Code de pairing généré',
            description: 'Veuillez entrer le code dans WhatsApp',
          })
          navigate('/auth/verify-otp', {
            state: {
              phoneNumber: fullPhoneNumber,
              code,
              pairingToken,
              scenario: 'pairing',
            },
          })
          return
        }

        if (scenario === 'provisioning') {
          notification.info({
            message: 'Préparation de votre stack',
            description:
              response.data.message || 'Nous mettons votre instance en route...',
          })
          navigate('/auth/provisioning', {
            state: {
              deviceType,
              pairingToken,
              phoneNumber: fullPhoneNumber,
              qrSessionToken,
            },
          })
          return
        }

        // Scénario 3: QR Code (desktop, nouvel utilisateur)
        if (scenario === 'qr') {
          // Demander le QR code au backend
          const qrResponse = await apiClient.post('/auth/request-qr', {
            phoneNumber: fullPhoneNumber,
          })

          if (qrResponse.status === 201 || qrResponse.status === 200) {
            // User is already connected
            if (qrResponse.data.scenario === 'connected') {
              notification.success({
                message: 'Connexion réussie',
                description: 'Vous êtes déjà connecté',
              })

              if (qrResponse.data.accessToken) {
                trackFirstLoginSignUp({
                  authFlow: 'qr',
                  isFirstLogin: Boolean(qrResponse.data.isFirstLogin),
                  userId: qrResponse.data.user?.id,
                })
                login(qrResponse.data.user)

                setTimeout(() => {
                  navigate(qrResponse.data.redirectTo || '/context')
                }, 1000)
              }
              return
            }

            // Set up QR code display
            setPairingToken(qrResponse.data.pairingToken)
            setQrSessionToken(qrResponse.data.qrSessionToken)
            setIsQrMode(true)

            // If QR code is provided, display it
            if (qrResponse.data.qrCode) {
              setQrCode(qrResponse.data.qrCode)

              notification.success({
                message: 'Code QR généré',
                description: 'Scannez le code QR avec votre WhatsApp',
              })
            } else {
              // No QR code yet, polling will fetch it
              notification.info({
                message: 'Vérification en cours',
                description: qrResponse.data.message || 'Veuillez patienter...',
              })
            }
          }
          return
        }
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }

      // Message spécifique pour mobile si requestPairingCode échoue
      if (
        isMobile &&
        err.response?.data?.message?.includes('code de jumelage a échoué')
      ) {
        notification.error({
          message: 'Impossible de se connecter',
          description: err.response.data.message,
          duration: 10,
        })
      } else {
        notification.error({
          message: 'Erreur',
          description:
            err.response?.data?.message ||
            'Une erreur est survenue lors de la connexion',
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const savedPhone = localStorage.getItem(LAST_PHONE_KEY)
    if (savedPhone) {
      try {
        const phoneValue = normalizeCountryPhoneValue(
          JSON.parse(savedPhone),
          DEFAULT_PHONE_COUNTRY_CODE
        )

        if (phoneValue) {
          form.setFieldsValue({ phone: phoneValue })
        }
      } catch {
        // Ignore parsing errors for saved phone
      }
    }
  }, [form])

  // Affichage du QR code (desktop)
  if (!isMobile && isQrMode && qrCode) {
    return (
      <div className='min-h-screen flex flex-col items-center bg-bg-subtle px-2 py-8'>
        <div className='my-[15vh] w-card max-w-full flex flex-col items-center'>
          <div className='w-full max-w-[780px] rounded-[28px] border-none bg-[rgba(255,255,255,0.8)] p-1 shadow-[0px_0px_1px_0px_rgba(0,0,0,0.4),0px_24px_60px_rgba(17,27,33,0.08)]'>
            <div className='rounded-[24px] bg-white flex flex-col items-center p-12'>
              {/* Header */}
              <div className='text-center mb-8'>
                <h1 className='text-xl font-medium text-text-dark leading-9 mb-2'>
                  Votre business <span className='text-black'>piloté</span> par{' '}
                  <span className='text-primary-green'>L&apos;IA</span>
                </h1>
                <p className='text-base text-text-muted'>
                  Veuillez scanner le code QR ci-dessous avec votre numéro{' '}
                  <span className='text-text-dark'>WhatsApp Business</span>
                </p>
              </div>

              {/* QR Code */}
              <div className='mb-6 rounded-[var(--radius-control)] border-none bg-white p-8 shadow-card'>
                <QRCodeSVG value={qrCode} size={256} level='M' />
              </div>

              {/* Loading indicator during polling */}
              <div className='flex items-center gap-3 text-text-muted'>
                {isPolling && <Spin />}
                <span>
                  {isPolling
                    ? 'Vérification en cours...'
                    : 'En attente de la connexion...'}
                </span>
              </div>

              {/* Bouton retour */}
              <Button
                type='text'
                onClick={() => {
                  // Stop polling
                  if (pollingIntervalRef.current) {
                    clearInterval(pollingIntervalRef.current)
                    pollingIntervalRef.current = null
                  }

                  setIsQrMode(false)
                  setQrCode(null)
                  setPairingToken(null)
                  setQrSessionToken(null)
                  setIsPolling(false)
                }}
                className='mt-6'
              >
                Retour
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Affichage du formulaire (desktop sans QR mode OU mobile)
  return (
    <div className='min-h-screen flex flex-col items-center bg-bg-subtle px-2 py-8'>
      <div className='my-[15vh] w-card max-w-full flex flex-col items-center'>
        <div className='w-full max-w-[780px] rounded-[28px] border-none bg-[rgba(255,255,255,0.8)] p-1 shadow-[0px_0px_1px_0px_rgba(0,0,0,0.4),0px_24px_60px_rgba(17,27,33,0.08)]'>
          <div className='rounded-[24px] bg-white px-6 py-10 sm:px-10 sm:py-12'>
            {/* Header */}
            <div className='text-center mb-8'>
              <h1 className='text-xl font-medium text-text-dark leading-9 mb-2'>
                Votre business <span className='text-black'>piloté</span> par{' '}
                <span className='text-primary-green'>L&apos;IA</span>
              </h1>
              <p className='text-base text-text-muted'>
                Saisissez votre numéro{' '}
                <span className='text-text-dark'>Whatsapp Business</span> pour
                commencer
              </p>
            </div>

            <Form
              form={form}
              onFinish={handleContinue}
              className='flex flex-col items-center gap-4'
            >
              <FormItem
                name='phone'
                className='auth-phone-field w-full max-w-[320px]'
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

              <FormItem className='mb-0 mt-2'>
                <Button
                  type='primary'
                  htmlType='submit'
                  size='large'
                  loading={isLoading}
                  className='min-w-[220px] !h-[46px] !rounded-full px-8'
                >
                  Continuer
                  <ArrowRightOutlined />
                </Button>
              </FormItem>

              <Text
                type='secondary'
                className='block max-w-[420px] text-center text-sm leading-6'
              >
                En cliquant sur continuer, vous acceptez notre{' '}
                <Link href='/auth/privacy'>politique de confidentialité</Link>{' '}
                et nos{' '}
                <Link href='/auth/terms'>
                  conditions générales d&apos;utilisation
                </Link>
                .
              </Text>
            </Form>
          </div>
        </div>

        <div className='flex flex-wrap justify-center gap-3 lg:mt-4 mt-2'>
          <Button
            type='default'
            size='large'
            onClick={() => {
              const featuresSection = document.getElementById('features')
              if (featuresSection) {
                featuresSection.scrollIntoView({ behavior: 'smooth' })
              }
            }}
            icon={<QuestionCircleOutlined />}
            iconPosition={'end'}
          >
            Des questions ?
          </Button>
          <Button
            type='default'
            size='large'
            onClick={() => setSelectedFeatureKey('Réponses aux questions')}
            icon={<CustomerServiceOutlined />}
            iconPosition={'end'}
          >
            Aide
          </Button>
          <Button
            type='default'
            size='large'
            onClick={() =>
              setSelectedFeatureKey('Négociations des prix suivant vos règles')
            }
            icon={<DollarOutlined />}
            iconPosition={'end'}
          >
            Prix
          </Button>
        </div>
      </div>

      <div
        className='flex flex-wrap items-start justify-center gap-8'
        id='features'
      >
        {Object.entries(featuresConfig).map(([key, category]) => (
          <div key={key} className='text-center'>
            <h3 className='text-base text-text-muted mb-4'>{category.title}</h3>
            <div className='flex flex-col gap-2 items-center'>
              {category.features.map((feature, index) => {
                const FeatureIcon = feature.icon

                return (
                  <Button
                    key={index}
                    variant='outlined'
                    size='small'
                    icon={<FeatureIcon />}
                    iconPosition='start'
                    onClick={() => setSelectedFeatureKey(feature.title)}
                  >
                    {feature.title}
                  </Button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={selectedFeature !== null}
        onCancel={() => setSelectedFeatureKey(null)}
        closeIcon={null}
        footer={[
          <Button
            key='close'
            type='primary'
            onClick={() => setSelectedFeatureKey(null)}
          >
            Fermer
          </Button>,
        ]}
        title={
          selectedFeature && (
            <div className='flex items-center gap-2 mb-2'>
              <span className={'text-2xl'}>
                <selectedFeature.icon />
              </span>
              <span>{selectedFeature.title}</span>
            </div>
          )
        }
      >
        {selectedFeature && (
          <p className='text-base text-text-muted mb-6'>
            {selectedFeature.description}
          </p>
        )}
      </Modal>
    </div>
  )
}
