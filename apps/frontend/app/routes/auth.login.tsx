import { theme } from '@app/core/theme'
import apiClient from '@app/lib/api/client'
import {
  App,
  Button,
  Card,
  ConfigProvider,
  Typography,
  // Form
} from 'antd'
import Form from 'antd/es/form'
import FormItem from 'antd/es/form/FormItem'
import PhoneInput, { locale } from 'antd-phone-input'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

const { Title, Text } = Typography

const LAST_PHONE_KEY = 'whatsapp-agent-last-phone'

interface RequestPairingResponse {
  code: string
  pairingToken: string
  message: string
}

interface PhoneValue {
  countryCode?: number
  areaCode?: string
  phoneNumber?: string
  isoCode?: string
}

interface FormValues {
  phone: PhoneValue
}

export function meta() {
  return [
    { title: 'Connexion - WhatsApp Agent' },
    {
      name: 'description',
      content: 'Connectez-vous avec votre numéro WhatsApp',
    },
  ]
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { notification } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [isLoading, setIsLoading] = useState(false)

  const getFullPhoneNumber = (value?: PhoneValue): string => {
    if (!value?.countryCode || !value?.phoneNumber) return ''
    const areaCode = value.areaCode || ''
    return `+${value.countryCode}${areaCode}${value.phoneNumber}`
  }

  const handleSubmit = async (values: FormValues) => {
    const fullPhoneNumber = getFullPhoneNumber(values.phone)

    if (!fullPhoneNumber || !values.phone?.phoneNumber) {
      notification.error({
        message: 'Erreur',
        description: 'Veuillez entrer un numéro de téléphone valide',
      })
      return
    }

    setIsLoading(true)

    try {
      const response = await apiClient.post('/auth/request-pairing', {
        phoneNumber: fullPhoneNumber,
      })

      if (response.status === 201 || response.status === 200) {
        // Sauvegarder le numéro de téléphone dans localStorage
        localStorage.setItem(LAST_PHONE_KEY, JSON.stringify(values.phone))

        // Navigate to pairing code page with the code, phone number, and pairing token
        console.log('response', response.data)
        navigate('/auth/pairing-code', {
          state: {
            phoneNumber: fullPhoneNumber,
            code: response.data.code,
            pairingToken: response.data.pairingToken,
          },
        })
      } else {
        throw new Error()
      }
    } catch (error: any) {
      notification.error({
        message: 'Erreur',
        description:
          error.response?.data?.message ||
          'Une erreur est survenue lors de la demande du code de pairing',
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Restaurer le dernier numéro de téléphone utilisé
  useEffect(() => {
    const savedPhone = localStorage.getItem(LAST_PHONE_KEY)
    if (savedPhone) {
      try {
        const phoneValue = JSON.parse(savedPhone) as PhoneValue
        form.setFieldsValue({ phone: phoneValue })
      } catch (error) {
        console.error('Error parsing saved phone number:', error)
      }
    }
  }, [form])

  const validator = useCallback((_: any, options: any) => {
    console.log('valid', _, options)
    if (options.valid(true)) return Promise.resolve()
    return Promise.reject('Veuillez saisir un numéro valide')
  }, [])

  return (
    <div className='min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4'>
      <Card className='max-w-md w-full shadow-xl'>
        <div className='text-center mb-8'>
          <Title level={2}>Connexion WhatsApp</Title>
          <Text type='secondary'>
            Entrez votre numéro de téléphone pour commencer
          </Text>
        </div>

        <Form form={form} layout='vertical' onFinish={handleSubmit}>
          <ConfigProvider theme={theme} locale={locale('frFR')}>
            <FormItem
              rules={[{ validator }]}
              name='phone'
              label='Numéro de téléphone'
              validateTrigger='onBlur'
              required
              help='Sélectionnez votre pays et entrez votre numéro'
            >
              <PhoneInput
                useSVG
                disableParentheses
                enableArrow
                enableSearch
                size='large'
              />
            </FormItem>
          </ConfigProvider>

          <Form.Item>
            <Button
              type='primary'
              htmlType='submit'
              size='large'
              loading={isLoading}
              className='w-full'
            >
              Demander le code de pairing
            </Button>
          </Form.Item>
        </Form>

        <div className='text-center mt-6 pt-6 border-t border-gray-200'>
          <Text type='secondary' className='block mb-2'>
            Vous avez déjà un compte?
          </Text>
          <Button
            type='link'
            onClick={() => navigate('/auth/verify-otp')}
            className='font-medium'
          >
            Se connecter avec un code OTP
          </Button>
        </div>
      </Card>
    </div>
  )
}
