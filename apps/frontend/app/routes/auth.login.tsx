import {
  ArrowRightOutlined,
  CustomerServiceOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'
import { featuresConfig } from '@app/data/features'
import apiClient from '@app/lib/api/client'
import { App, Button, Modal } from 'antd'
import Form from 'antd/es/form'
import FormItem from 'antd/es/form/FormItem'
import PhoneInput, { type PhoneNumber } from 'antd-phone-input'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const LAST_PHONE_KEY = 'whatsapp-agent-last-phone'

interface FormValues {
  phone: PhoneNumber
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

export default function LoginPage() {
  const navigate = useNavigate()
  const { notification } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [isLoading, setIsLoading] = useState(false)
  const [selectedFeatureKey, setSelectedFeatureKey] = useState<string | null>(
    null
  )

  // Récupérer la feature sélectionnée depuis la config
  const selectedFeature = selectedFeatureKey
    ? Object.values(featuresConfig)
        .flatMap(category => category.features)
        .find(f => `${f.title}` === selectedFeatureKey)
    : null

  const handleSubmit = async (values: FormValues) => {
    const { phone } = values
    const fullPhoneNumber = `+${phone.countryCode}${phone.areaCode}${phone.phoneNumber}`

    if (!phone.phoneNumber) {
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
        // Save phone for later
        localStorage.setItem(LAST_PHONE_KEY, JSON.stringify(phone))

        // Navigate to OTP verification
        navigate('/auth/verify-otp', {
          state: {
            phoneNumber: fullPhoneNumber,
            code: response.data.code,
            pairingToken: response.data.pairingToken,
            scenario: response.data.scenario, // 'pairing' | 'otp'
          },
        })
      } else {
        throw new Error()
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      notification.error({
        message: 'Erreur',
        description:
          err.response?.data?.message ||
          'Une erreur est survenue lors de la demande du code',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const savedPhone = localStorage.getItem(LAST_PHONE_KEY)
    if (savedPhone) {
      try {
        const phoneValue = JSON.parse(savedPhone) as PhoneNumber
        form.setFieldsValue({ phone: phoneValue })
      } catch {
        // Ignore parsing errors for saved phone
      }
    }
  }, [form])

  return (
    <div className='min-h-screen flex flex-col items-center bg-bg-subtle px-2 py-8'>
      <div className='w-card max-w-full my-[15vh] flex flex-col items-center'>
        <div className='bg-white rounded-card-outer shadow-card-subtle p-1'>
          <div className='bg-white rounded-card-inner shadow-card p-12'>
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
              onFinish={handleSubmit}
              className='flex flex-col items-center gap-3'
            >
              <FormItem
                name='phone'
                // className='!mb-0 w-[320px]'
                rules={[
                  { required: true, message: 'Veuillez entrer votre numéro' },
                ]}
              >
                <PhoneInput
                  // size='large'
                  enableSearch
                  enableArrow
                  disableParentheses
                />
              </FormItem>

              <FormItem className='mb-0 mt-4'>
                <Button
                  type='primary'
                  htmlType='submit'
                  size='large'
                  loading={isLoading}
                  className='h-button px-8 bg-primary-green border-black border hover:bg-primary-hover flex items-center gap-2'
                >
                  Continuer
                  <ArrowRightOutlined />
                </Button>
              </FormItem>
            </Form>
          </div>
        </div>

        <div className='flex justify-center gap-4 lg:mt-4 mt-2'>
          <Button
            variant={'outlined'}
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
            Fonctionnalités
          </Button>
          <Button
            variant={'outlined'}
            size='large'
            icon={<CustomerServiceOutlined />}
            iconPosition={'end'}
          >
            Aide
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
              {category.features.map((feature, index) => (
                <Button
                  key={index}
                  variant='outlined'
                  size='small'
                  icon={feature.icon}
                  iconPosition='start'
                  onClick={() => setSelectedFeatureKey(feature.title)}
                >
                  {feature.title}
                </Button>
              ))}
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
              <span className={'text-2xl'}>{selectedFeature.icon}</span>
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
