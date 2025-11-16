import { CheckCircleOutlined } from '@ant-design/icons'
import { useAuth } from '@app/hooks/useAuth'
import apiClient from '@app/lib/api/client'
import { App, Card, Typography, Steps, Button } from 'antd'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router'

const { Title, Text, Paragraph } = Typography

interface LocationState {
  phoneNumber: string
  code: string
  pairingToken: string
}

export function meta() {
  return [
    { title: 'Code de pairing - WhatsApp Agent' },
    { name: 'description', content: 'Entrez votre code de pairing WhatsApp' },
  ]
}

export default function PairingCodePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { notification } = App.useApp()
  const { login } = useAuth()
  const [isConfirming, setIsConfirming] = useState(false)
  const [pairingCompleted, setPairingCompleted] = useState(false)
  const [useManualPairing, setUseManualPairing] = useState(false)
  const [isExpired, setIsExpired] = useState(false)

  const state = location.state as LocationState

  // Redirect if no code/phone number/pairingToken
  useEffect(() => {
    if (!state?.code || !state?.phoneNumber || !state?.pairingToken) {
      notification.error({
        message: 'Erreur',
        description: 'Informations de pairing manquantes',
      })
      navigate('/auth/login')
    }
  }, [state, navigate, notification])

  // Timer de 5 minutes pour expiration du code
  useEffect(() => {
    const timer = setTimeout(
      () => {
        if (!pairingCompleted) {
          setIsExpired(true)
        }
      },
      5 * 60 * 1000
    ) // 5 minutes en millisecondes

    return () => clearTimeout(timer)
  }, [pairingCompleted])

  // Handle user confirming they've completed pairing
  const handleConfirmPairing = async () => {
    if (!state?.pairingToken) {
      notification.error({
        message: 'Erreur',
        description: 'Token de pairing manquant',
      })
      return
    }

    setIsConfirming(true)

    try {
      const response = await apiClient.post('/auth/confirm-pairing', {
        pairingToken: state.pairingToken,
      })

      // Save token and user data
      if (response.data.accessToken) {
        login(response.data.accessToken, response.data.user)
      }

      setPairingCompleted(true)

      notification.success({
        message: 'Connexion réussie',
        description: 'Votre compte WhatsApp a été lié avec succès',
      })

      // Navigate to onboarding
      setTimeout(() => {
        navigate('/onboarding/import')
      }, 1500)
    } catch (error: any) {
      console.error('Error confirming pairing:', error)

      notification.error({
        message: 'Erreur',
        description:
          error.response?.data?.message ||
          'Une erreur est survenue lors de la confirmation. Veuillez vérifier que vous avez bien entré le code dans WhatsApp.',
      })
    } finally {
      setIsConfirming(false)
    }
  }

  if (!state?.code) {
    return null
  }

  // Format code with spaces for better readability (e.g., "1234 5678")
  const formattedCode = state.code.match(/.{1,4}/g)?.join(' ') || state.code

  return (
    <div className='min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4'>
      <Card className='max-w-2xl w-full shadow-xl'>
        {isExpired ? (
          // Écran d'expiration
          <div className='text-center py-12'>
            <div className='mb-6'>
              <svg
                className='mx-auto h-24 w-24 text-orange-500'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'
                />
              </svg>
            </div>
            <Title level={2} className='mb-4'>
              Code expiré
            </Title>
            <Paragraph className='text-lg text-gray-600 mb-8'>
              Le code de pairing a expiré après 5 minutes d'inactivité.
              <br />
              Veuillez générer un nouveau code pour continuer.
            </Paragraph>
            <Button
              type='primary'
              size='large'
              onClick={() => navigate('/auth/login')}
            >
              Générer un nouveau code
            </Button>
          </div>
        ) : (
          <>
            <div className='text-center mb-8'>
              <Title level={2} className='mb-2'>
                Confirmation du {state?.phoneNumber}
              </Title>
              <Link
                to='/auth/login'
                className='text-blue-500 hover:text-blue-600'
              >
                Changer ce numéro de tel
              </Link>
            </div>

            {/* Pairing Code Display */}
            <div className='bg-green-50 border-2 border-green-200 rounded-lg p-8 mb-8 text-center'>
              <div className='text-3xl font-bold text-green-600 tracking-widest font-mono'>
                {formattedCode}
              </div>
            </div>

            {/* Instructions */}
            <div className='mb-8'>
              <Title level={4} className='mb-4'>
                Instructions:
              </Title>

              {!useManualPairing ? (
                // Default: Notification-based pairing
                <>
                  <Steps
                    direction='vertical'
                    current={pairingCompleted ? 3 : 2}
                    items={[
                      {
                        title: 'Ouvrir la notification de connexion reçue',
                        description: (
                          <>
                            Vous devriez recevoir une notification WhatsApp sur
                            votre téléphone.
                            <br />
                            <Button
                              variant={'link'}
                              color={'primary'}
                              className={'-ml-4'}
                              onClick={() => setUseManualPairing(true)}
                            >
                              Je n'ai pas reçu de notification
                            </Button>
                          </>
                        ),
                        status: 'finish',
                      },
                      {
                        title: 'Entrer le code ci-dessous',
                        description: (
                          <>
                            Entrez ce code dans WhatsApp:{' '}
                            <strong>{formattedCode}</strong>
                          </>
                        ),
                        status: pairingCompleted ? 'finish' : 'process',
                      },
                      {
                        title: 'Appuyer sur le bouton ci-dessous',
                        description:
                          'Une fois le code entré, cliquez sur "J\'ai terminé"',
                        status: pairingCompleted ? 'finish' : 'wait',
                        icon: pairingCompleted ? (
                          <CheckCircleOutlined />
                        ) : undefined,
                      },
                    ]}
                  />
                </>
              ) : (
                // Manual pairing with full steps
                <Steps
                  direction='vertical'
                  current={pairingCompleted ? 5 : 4}
                  items={[
                    {
                      title:
                        'Allez dans Paramètres Whatsapp de votre téléphone',
                      description:
                        'Tapez sur les trois points en haut à droite',
                      status: 'finish',
                    },
                    {
                      title: 'Appareils connectés',
                      description: 'Sélectionnez "Appareils connectés"',
                      status: 'finish',
                    },
                    {
                      title: 'Associer un appareil',
                      description: 'Appuyez sur "Associer un appareil"',
                      status: 'finish',
                    },
                    {
                      title: 'Associer avec un numéro de téléphone',
                      description: 'Qui se trouve tout en bas',
                      status: 'finish',
                    },
                    {
                      title: 'Entrez le code',
                      description: (
                        <>
                          Sélectionnez "Associer avec un numéro de téléphone" et
                          entrez ce code: <strong>{formattedCode}</strong>
                        </>
                      ),
                      status: pairingCompleted ? 'finish' : 'process',
                      icon: pairingCompleted ? (
                        <CheckCircleOutlined />
                      ) : undefined,
                    },
                  ]}
                />
              )}
            </div>

            {/* Confirmation Button */}
            {!pairingCompleted && (
              <div className='text-center py-6 border-t border-gray-200'>
                <Paragraph className='text-base mb-4'>
                  Une fois que vous avez entré le code dans WhatsApp :
                </Paragraph>
                <Button
                  type='primary'
                  size='large'
                  loading={isConfirming}
                  onClick={handleConfirmPairing}
                  className='min-w-[200px]'
                >
                  {isConfirming ? 'Vérification...' : "J'ai terminé"}
                </Button>
                <Text type='secondary' className='block mt-3 text-sm'>
                  Assurez-vous d'avoir entré le code de pairing avant de cliquer
                </Text>
                <div className='mt-4'>
                  <Button
                    type='default'
                    size='large'
                    onClick={() => navigate('/auth/login')}
                    className='min-w-[200px]'
                  >
                    Régénérer le code
                  </Button>
                </div>
              </div>
            )}

            {/* Success State */}
            {pairingCompleted && (
              <div className='text-center py-6 border-t border-gray-200'>
                <CheckCircleOutlined className='text-5xl text-green-500 mb-4' />
                <Paragraph className='text-base mb-0 font-medium text-green-600'>
                  Connexion réussie !
                </Paragraph>
                <Text type='secondary' className='text-sm'>
                  Redirection vers l'onboarding...
                </Text>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
