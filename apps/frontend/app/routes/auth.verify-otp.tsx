import { useState } from 'react'
import { useNavigate } from 'react-router'
import { App, Button, Card, Form, Typography, Input } from 'antd'
import PhoneInput from 'antd-phone-input'
import { useAuth } from '@app/hooks/useAuth'
import apiClient from '@app/lib/api/client'

const { Title, Text, Paragraph } = Typography

interface LoginResponse {
  message: string
}

interface VerifyOtpResponse {
  accessToken: string
  user: {
    id: string
    phoneNumber: string
    status: string
    whatsappProfile?: any
  }
}

interface PhoneValue {
  countryCode?: number
  areaCode?: string
  phoneNumber?: string
  isoCode?: string
}

interface PhoneFormValues {
  phone: PhoneValue
}

interface OtpFormValues {
  code: string
}

export function meta() {
  return [
    { title: 'Vérification OTP - WhatsApp Agent' },
    { name: 'description', content: 'Vérifiez votre code OTP pour vous connecter' },
  ]
}

export default function VerifyOtpPage() {
  const navigate = useNavigate()
  const { notification } = App.useApp()
  const { login } = useAuth()
  const [phoneForm] = Form.useForm<PhoneFormValues>()
  const [otpForm] = Form.useForm<OtpFormValues>()
  const [fullPhoneNumber, setFullPhoneNumber] = useState<string>('')
  const [isRequestingOtp, setIsRequestingOtp] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const phoneValue = Form.useWatch('phone', phoneForm)

  const getFullPhoneNumber = (value?: PhoneValue): string => {
    if (!value?.countryCode || !value?.phoneNumber) return ''
    const areaCode = value.areaCode || ''
    return `+${value.countryCode}${areaCode}${value.phoneNumber}`
  }

  const handleRequestOtp = async (values: PhoneFormValues) => {
    const phoneNum = getFullPhoneNumber(values.phone)

    if (!phoneNum || !values.phone?.phoneNumber) {
      notification.error({
        message: 'Erreur',
        description: 'Veuillez entrer un numéro de téléphone valide',
      })
      return
    }

    setIsRequestingOtp(true)

    try {
      await apiClient.post<LoginResponse>('/auth/login', {
        phoneNumber: phoneNum,
      })

      notification.success({
        message: 'Code envoyé',
        description: 'Un code OTP a été envoyé à votre WhatsApp',
      })

      setFullPhoneNumber(phoneNum)
      setOtpSent(true)
    } catch (error: any) {
      notification.error({
        message: 'Erreur',
        description:
          error.response?.data?.message ||
          'Une erreur est survenue lors de l\'envoi du code OTP',
      })
    } finally {
      setIsRequestingOtp(false)
    }
  }

  const handleVerifyOtp = async (values: OtpFormValues) => {
    if (!fullPhoneNumber) {
      notification.error({
        message: 'Erreur',
        description: 'Numéro de téléphone manquant',
      })
      return
    }

    setIsVerifying(true)

    try {
      const response = await apiClient.post<VerifyOtpResponse>(
        '/auth/verify-otp',
        {
          phoneNumber: fullPhoneNumber,
          code: values.code,
        }
      )

      // Save token and user data
      login(response.data.accessToken, response.data.user)

      notification.success({
        message: 'Connexion réussie',
        description: 'Vous êtes maintenant connecté',
      })

      // Navigate to dashboard
      navigate('/dashboard')
    } catch (error: any) {
      notification.error({
        message: 'Erreur',
        description:
          error.response?.data?.message ||
          'Code OTP invalide ou expiré',
      })
    } finally {
      setIsVerifying(false)
    }
  }

  const isValidPhoneNumber = phoneValue?.phoneNumber && phoneValue?.countryCode

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <Card className="max-w-md w-full shadow-xl">
        <div className="text-center mb-8">
          <Title level={2} className="mb-2">
            Connexion
          </Title>
          <Text type="secondary">
            {otpSent
              ? 'Entrez le code OTP reçu sur WhatsApp'
              : 'Connectez-vous avec votre numéro de téléphone'}
          </Text>
        </div>

        {!otpSent ? (
          // Step 1: Request OTP
          <Form form={phoneForm} layout="vertical" onFinish={handleRequestOtp}>
            <Form.Item
              name="phone"
              label="Numéro de téléphone"
              required
              help="Sélectionnez votre pays et entrez votre numéro"
            >
              <PhoneInput
                enableSearch
                size="large"
              />
            </Form.Item>

            <Form.Item className="mb-4">
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                loading={isRequestingOtp}
                disabled={!isValidPhoneNumber}
                className="w-full"
              >
                Recevoir le code OTP
              </Button>
            </Form.Item>
          </Form>
        ) : (
          // Step 2: Verify OTP
          <div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <Paragraph className="mb-0 text-sm">
                Un code à 6 chiffres a été envoyé au numéro{' '}
                <strong>{fullPhoneNumber}</strong>
              </Paragraph>
            </div>

            <Form
              form={otpForm}
              layout="vertical"
              onFinish={handleVerifyOtp}
            >
              <Form.Item
                name="code"
                label="Code OTP"
                rules={[
                  {
                    required: true,
                    message: 'Veuillez entrer le code OTP',
                  },
                  {
                    len: 6,
                    message: 'Le code doit contenir 6 chiffres',
                  },
                ]}
              >
                <Input.OTP
                  length={6}
                  size="large"
                  formatter={(str) => str.toUpperCase()}
                />
              </Form.Item>

              <Form.Item className="mb-4">
                <Button
                  type="primary"
                  htmlType="submit"
                  size="large"
                  loading={isVerifying}
                  className="w-full"
                >
                  Se connecter
                </Button>
              </Form.Item>

              <div className="text-center">
                <Button
                  type="link"
                  onClick={() => {
                    setOtpSent(false)
                    otpForm.resetFields()
                  }}
                  className="text-sm"
                >
                  Changer de numéro
                </Button>
              </div>
            </Form>
          </div>
        )}

        <div className="text-center mt-6 pt-6 border-t border-gray-200">
          <Text type="secondary" className="block mb-2">
            Première connexion?
          </Text>
          <Button
            type="link"
            onClick={() => navigate('/auth/login')}
            className="font-medium"
          >
            Demander un code de pairing
          </Button>
        </div>
      </Card>
    </div>
  )
}
