import { ArrowRightOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { useAuth } from '@app/hooks/useAuth'
import apiClient from '@app/lib/api/client'
import { App, Button, Form, Input } from 'antd'
import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

interface VerifyOtpResponse {
  accessToken: string
  user: {
    id: string
    phoneNumber: string
    status: string
    whatsappProfile?: { pushName?: string }
    contextScore?: number
  }
}

interface OtpFormValues {
  code: string
}

interface LocationState {
  phoneNumber?: string
  code?: string
  pairingToken?: string
  scenario?: 'pairing' | 'otp'
}

export function meta() {
  return [
    { title: 'Confirmation - WhatsApp Agent' },
    {
      name: 'description',
      content: 'Confirmez votre code pour vous connecter',
    },
  ]
}

export default function VerifyOtpPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { notification } = App.useApp()
  const { login } = useAuth()
  const [form] = Form.useForm<OtpFormValues>()
  const [isVerifying, setIsVerifying] = useState(false)

  const state = location.state as LocationState
  const pairingToken = state?.pairingToken
  const scenario = state?.scenario || 'pairing' // Default to pairing for backward compatibility
  const isPairingScenario = scenario === 'pairing'
  const isOtpScenario = scenario === 'otp'

  const handleVerifyOtp = async (values?: OtpFormValues) => {
    if (!pairingToken) {
      notification.error({
        message: 'Erreur',
        description: 'Token de session manquant',
      })
      navigate('/auth/login')
      return
    }

    setIsVerifying(true)

    try {
      const response = await apiClient.post<VerifyOtpResponse>(
        '/auth/confirm-pairing',
        {
          pairingToken,
          otpCode: isOtpScenario && values ? values.code : undefined,
        }
      )

      // Save token and user data
      login(response.data.accessToken, response.data.user)

      notification.success({
        message: 'Connexion réussie',
        description: 'Vous êtes maintenant connecté',
      })

      // Check context score and redirect accordingly
      const contextScore = response.data.user.contextScore ?? 0
      if (contextScore < 80) {
        navigate('/context')
      } else {
        navigate('/')
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      notification.error({
        message: 'Erreur',
        description: err.response?.data?.message || 'Code invalide ou expiré',
      })
    } finally {
      setIsVerifying(false)
    }
  }

  const handleBack = () => {
    navigate('/auth/login')
  }

  return (
    <div className='min-h-screen flex flex-col items-center justify-center bg-[#fdfdfd] px-4 py-8'>
      {/* Main Card */}
      <div className='w-full max-w-[719px]'>
        <div className='bg-white rounded-[28px] shadow-[0px_0px_1px_0px_rgba(0,0,0,0.3)] p-1'>
          <div className='bg-white rounded-[24px] shadow-[0px_0px_1px_0px_rgba(0,0,0,0.4)] overflow-hidden'>
            {/* Header */}
            <div className='bg-white pt-12 px-12 text-center'>
              <h1 className='text-2xl font-normal text-[#111b21] leading-[30px] mb-4'>
                {isPairingScenario
                  ? 'Connexion de votre appareil'
                  : 'Connexion'}
              </h1>
              <div className='text-base text-[#494949] leading-6'>
                {isPairingScenario ? (
                  <>
                    <p className='mb-0'>
                      Scannez le QR code ou entrez le code de pairing sur votre
                      téléphone WhatsApp Business
                    </p>
                    <p className='mb-0 mt-2'>
                      Code de pairing: <strong>{state?.code}</strong>
                    </p>
                    <p className='mt-2'>
                      Pas de panique, nous ne répondrons à aucun de vos clients
                      pour le moment
                    </p>
                  </>
                ) : (
                  <>
                    <p className='mb-0'>
                      Veuillez ouvrir la conversation{' '}
                      <strong>{state?.phoneNumber}</strong> (votre numéro) sur
                      votre application WhatsApp
                    </p>
                    <p>et saisir ci-dessous le code qui s'y trouve</p>
                  </>
                )}
              </div>
            </div>

            {/* OTP/Code Input */}
            {isOtpScenario && (
              <div className='px-12 py-8 flex justify-center'>
                <Form form={form} onFinish={handleVerifyOtp}>
                  <Form.Item
                    name='code'
                    rules={[
                      {
                        required: true,
                        message: 'Veuillez entrer le code',
                      },
                      {
                        len: 6,
                        message: 'Le code doit contenir 6 chiffres',
                      },
                    ]}
                    className='mb-0'
                  >
                    <Input.OTP
                      length={6}
                      size='large'
                      style={{
                        width: '100%',
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          form.submit()
                        }
                      }}
                    />
                  </Form.Item>
                </Form>
              </div>
            )}

            {/* Pairing waiting state */}
            {isPairingScenario && (
              <div className='px-12 py-8 flex justify-center'>
                <p className='text-sm text-[#494949] text-center'>
                  En attente de la confirmation sur votre téléphone...
                </p>
              </div>
            )}

            {/* Actions */}
            <div className='px-12 pb-12'>
              <div className='flex justify-center gap-3 mb-4'>
                <Button
                  type='default'
                  size='large'
                  onClick={handleBack}
                  className='h-[46px] w-[46px] px-4 rounded-full bg-white shadow-[0px_0px_1px_0px_rgba(0,0,0,0.4)] border-none flex items-center justify-center'
                >
                  <ArrowLeftOutlined />
                </Button>
                {isOtpScenario && (
                  <Button
                    type='primary'
                    size='large'
                    onClick={() => form.submit()}
                    loading={isVerifying}
                    className='h-[46px] px-8 bg-[#24d366] border-none hover:bg-[#1fb855] flex items-center gap-2'
                  >
                    <span className='text-sm font-medium tracking-[0.35px]'>
                      Vérifier le code
                    </span>
                    <ArrowRightOutlined />
                  </Button>
                )}
                {isPairingScenario && (
                  <Button
                    type='primary'
                    size='large'
                    onClick={() => handleVerifyOtp()}
                    loading={isVerifying}
                    className='h-[46px] px-8 bg-[#24d366] border-none hover:bg-[#1fb855] flex items-center gap-2'
                  >
                    <span className='text-sm font-medium tracking-[0.35px]'>
                      J'ai scanné le code
                    </span>
                    <ArrowRightOutlined />
                  </Button>
                )}
              </div>

              {/* Privacy Policy */}
              <p className='text-sm text-[#494949] text-center leading-5'>
                En cliquant sur continuer, vous acceptez notre{' '}
                <a
                  href='/privacy'
                  className='text-[#111b21] underline hover:text-[#24d366]'
                >
                  politique de confidentialité
                </a>{' '}
                et nos{' '}
                <a
                  href='/terms'
                  className='text-[#111b21] underline hover:text-[#24d366]'
                >
                  conditions générales d'utilisation
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
