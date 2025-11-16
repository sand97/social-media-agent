import { BellOutlined, StarOutlined, TagsOutlined } from '@ant-design/icons'
import { OnboardingLayout } from '@app/components/onboarding/OnboardingLayout'
import { useOnboarding } from '@app/hooks/useOnboarding'
import apiClient from '@app/lib/api/client'
import { Form, Checkbox, Button, Card, Alert, Tag, Space, message } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router'

export function meta() {
  return [
    { title: 'Options avancées - WhatsApp Agent' },
    {
      name: 'description',
      content: 'Configurez les options avancées de votre boutique',
    },
  ]
}

export default function OnboardingAdvancedOptions() {
  const navigate = useNavigate()
  const { currentStep, currentStepNumber } = useOnboarding(
    '/onboarding/advanced-options'
  )
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (values: any) => {
    setLoading(true)
    try {
      // TODO: Replace with actual API endpoint
      await apiClient.post('/settings/advanced', {
        autoReminder: values.autoReminder || false,
        requestReview: values.requestReview || false,
      })

      message.success('Configuration terminée avec succès!')

      // Navigate to dashboard
      setTimeout(() => {
        navigate('/dashboard')
      }, 500)
    } catch (error: any) {
      console.error('Erreur lors de la sauvegarde:', error)
      message.error(
        error.response?.data?.message ||
          'Erreur lors de la sauvegarde des options'
      )
    } finally {
      setLoading(false)
    }
  }

  const handlePrevious = () => {
    navigate('/onboarding/business-info')
  }

  return (
    <OnboardingLayout
      currentStep={currentStepNumber}
      title={currentStep?.title || ''}
    >
      <Form
        form={form}
        layout='vertical'
        onFinish={handleSubmit}
        initialValues={{
          autoReminder: false,
          requestReview: false,
        }}
      >
        <div className='space-y-6'>
          {/* Auto Reminder Option */}
          <Card className='hover:shadow-md transition-shadow'>
            <div className='flex items-start gap-4'>
              <div className='flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center'>
                <BellOutlined className='text-2xl text-blue-600' />
              </div>
              <div className='flex-1'>
                <Form.Item
                  name='autoReminder'
                  valuePropName='checked'
                  className='mb-0'
                >
                  <Checkbox>
                    <span className='text-lg font-semibold'>
                      Relancer automatiquement les clients
                    </span>
                  </Checkbox>
                </Form.Item>
                <p className='text-gray-600 mt-2 ml-6'>
                  Si un client fait une promesse de commande mais ne finalise
                  pas, lui envoyer automatiquement un rappel après 24 heures.
                </p>
                <div className='ml-6 mt-3'>
                  <Tag color='blue'>Recommandé</Tag>
                  <Tag color='green'>Augmente les conversions</Tag>
                </div>
              </div>
            </div>
          </Card>

          {/* Request Review Option */}
          <Card className='hover:shadow-md transition-shadow'>
            <div className='flex items-start gap-4'>
              <div className='flex-shrink-0 w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center'>
                <StarOutlined className='text-2xl text-yellow-600' />
              </div>
              <div className='flex-1'>
                <Form.Item
                  name='requestReview'
                  valuePropName='checked'
                  className='mb-0'
                >
                  <Checkbox>
                    <span className='text-lg font-semibold'>
                      Demander un avis aux clients
                    </span>
                  </Checkbox>
                </Form.Item>
                <p className='text-gray-600 mt-2 ml-6'>
                  Une fois une commande marquée comme livrée, demander
                  automatiquement un avis au client sur son expérience d'achat.
                </p>
                <div className='ml-6 mt-3'>
                  <Tag color='gold'>Recommandé</Tag>
                  <Tag color='purple'>Améliore la réputation</Tag>
                </div>
              </div>
            </div>
          </Card>

          {/* Tags System Explanation */}
          <Card
            title={
              <Space>
                <TagsOutlined className='text-blue-600' />
                <span>Système de tags</span>
              </Space>
            }
            className='bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200'
          >
            <p className='text-gray-700 mb-4'>
              Les tags vous permettent d'organiser et de filtrer vos clients,
              commandes et produits.
            </p>

            <div className='space-y-3'>
              <div>
                <strong className='text-gray-900'>
                  Exemples d'utilisation:
                </strong>
                <ul className='mt-2 ml-6 list-disc text-gray-600 space-y-1'>
                  <li>Marquer les clients VIP pour un service prioritaire</li>
                  <li>Identifier les produits en promotion</li>
                  <li>Catégoriser les commandes par statut personnalisé</li>
                  <li>Segmenter vos clients par région ou préférence</li>
                </ul>
              </div>

              <Alert
                message='Astuce'
                description="Vous pourrez créer et gérer vos tags depuis le tableau de bord après l'onboarding."
                type='info'
                showIcon
                className='mt-4'
              />
            </div>
          </Card>

          {/* Info Alert */}
          <Alert
            message='Vous pourrez modifier ces options plus tard'
            description='Ces paramètres peuvent être ajustés à tout moment depuis les paramètres de votre compte.'
            type='info'
            showIcon
          />

          {/* Action Buttons */}
          <div className='flex items-center justify-between pt-6 border-t'>
            <Button size='large' onClick={handlePrevious}>
              Précédent
            </Button>

            <Button
              type='primary'
              size='large'
              htmlType='submit'
              loading={loading}
            >
              Terminer et accéder au tableau de bord
            </Button>
          </div>
        </div>
      </Form>
    </OnboardingLayout>
  )
}
