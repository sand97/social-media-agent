import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { OnboardingLayout } from '@app/components/onboarding/OnboardingLayout'
import { useOnboarding } from '@app/hooks/useOnboarding'
import apiClient from '@app/lib/api/client'
import {
  Form,
  Input,
  Select,
  Button,
  Card,
  Checkbox,
  InputNumber,
  Divider,
  message,
} from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface DeliveryLocation {
  country: string
  city: string
  zoneName: string
  price: number
}

const countries = [
  { label: 'Cameroun', value: 'CM' },
  { label: "Côte d'Ivoire", value: 'CI' },
  { label: 'Sénégal', value: 'SN' },
  { label: 'Mali', value: 'ML' },
  { label: 'Burkina Faso', value: 'BF' },
  { label: 'Bénin', value: 'BJ' },
  { label: 'Togo', value: 'TG' },
]

export function meta() {
  return [
    { title: 'Informations boutique - WhatsApp Agent' },
    {
      name: 'description',
      content: 'Configurez les informations de votre boutique',
    },
  ]
}

export default function OnboardingBusinessInfo() {
  const navigate = useNavigate()
  const { currentStep, currentStepNumber } = useOnboarding(
    '/onboarding/business-info'
  )
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [deliveryLocations, setDeliveryLocations] = useState<
    DeliveryLocation[]
  >([{ country: '', city: '', zoneName: '', price: 0 }])

  const handleAddLocation = () => {
    setDeliveryLocations([
      ...deliveryLocations,
      { country: '', city: '', zoneName: '', price: 0 },
    ])
  }

  const handleRemoveLocation = (index: number) => {
    if (deliveryLocations.length > 1) {
      setDeliveryLocations(deliveryLocations.filter((_, i) => i !== index))
    }
  }

  const handleLocationChange = (
    index: number,
    field: keyof DeliveryLocation,
    value: any
  ) => {
    const updated = [...deliveryLocations]
    updated[index] = { ...updated[index], [field]: value }
    setDeliveryLocations(updated)
  }

  const handleSubmit = async (values: any) => {
    setLoading(true)
    try {
      // Prepare business settings data
      const businessData = {
        country: values.country,
        city: values.city,
        address: values.address,
        deliveryLocations: deliveryLocations.filter(
          loc => loc.country && loc.city && loc.zoneName
        ),
        paymentMethods: {
          cash: values.cash || false,
          mobileMoney: {
            enabled: values.mobileMoneyEnabled || false,
            number: values.mobileMoneyNumber || '',
            name: values.mobileMoneyName || '',
            requireProof: values.mobileMoneyRequireProof || false,
          },
        },
      }

      // TODO: Replace with actual API endpoint
      await apiClient.post('/settings/business', businessData)

      message.success('Informations sauvegardées avec succès')
      navigate('/onboarding/advanced-options')
    } catch (error: any) {
      console.error('Erreur lors de la sauvegarde:', error)
      message.error(
        error.response?.data?.message ||
          'Erreur lors de la sauvegarde des informations'
      )
    } finally {
      setLoading(false)
    }
  }

  const handlePrevious = () => {
    navigate('/onboarding/review-products')
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
          cash: true,
          mobileMoneyEnabled: false,
          mobileMoneyRequireProof: true,
        }}
      >
        {/* Business Location */}
        <Card title='Localisation de la boutique' className='mb-6'>
          <Form.Item
            label='Pays'
            name='country'
            rules={[
              { required: true, message: 'Veuillez sélectionner un pays' },
            ]}
          >
            <Select
              size='large'
              placeholder='Sélectionnez votre pays'
              options={countries}
            />
          </Form.Item>

          <Form.Item
            label='Ville'
            name='city'
            rules={[{ required: true, message: 'Veuillez entrer votre ville' }]}
          >
            <Input size='large' placeholder='Ex: Douala' />
          </Form.Item>

          <Form.Item
            label='Adresse'
            name='address'
            rules={[
              { required: true, message: 'Veuillez entrer votre adresse' },
            ]}
          >
            <Input.TextArea
              size='large'
              rows={3}
              placeholder='Ex: Quartier Akwa, Rue de la Joie'
            />
          </Form.Item>
        </Card>

        {/* Delivery Locations */}
        <Card
          title='Emplacements de livraison'
          className='mb-6'
          extra={
            <Button
              type='dashed'
              icon={<PlusOutlined />}
              onClick={handleAddLocation}
            >
              Ajouter un emplacement
            </Button>
          }
        >
          <div className='space-y-4'>
            {deliveryLocations.map((location, index) => (
              <Card
                key={index}
                size='small'
                className='bg-gray-50'
                extra={
                  deliveryLocations.length > 1 && (
                    <Button
                      type='text'
                      danger
                      size='small'
                      icon={<DeleteOutlined />}
                      onClick={() => handleRemoveLocation(index)}
                    >
                      Supprimer
                    </Button>
                  )
                }
              >
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-1'>
                      Pays
                    </label>
                    <Select
                      value={location.country}
                      onChange={value =>
                        handleLocationChange(index, 'country', value)
                      }
                      placeholder='Sélectionnez'
                      options={countries}
                      className='w-full'
                    />
                  </div>

                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-1'>
                      Ville
                    </label>
                    <Input
                      value={location.city}
                      onChange={e =>
                        handleLocationChange(index, 'city', e.target.value)
                      }
                      placeholder='Ex: Yaoundé'
                    />
                  </div>

                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-1'>
                      Nom de la zone
                    </label>
                    <Input
                      value={location.zoneName}
                      onChange={e =>
                        handleLocationChange(index, 'zoneName', e.target.value)
                      }
                      placeholder='Ex: Centre-ville'
                    />
                  </div>

                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-1'>
                      Prix (FCFA)
                    </label>
                    <InputNumber
                      value={location.price}
                      onChange={value =>
                        handleLocationChange(index, 'price', value || 0)
                      }
                      placeholder='0'
                      min={0}
                      className='w-full'
                      formatter={value =>
                        `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
                      }
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Card>

        {/* Payment Methods */}
        <Card title='Moyens de paiement' className='mb-6'>
          <Form.Item name='cash' valuePropName='checked'>
            <Checkbox>
              <span className='font-medium'>Espèces (Cash)</span>
            </Checkbox>
          </Form.Item>

          <Divider />

          <Form.Item name='mobileMoneyEnabled' valuePropName='checked'>
            <Checkbox>
              <span className='font-medium'>Mobile Money</span>
            </Checkbox>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, curr) =>
              prev.mobileMoneyEnabled !== curr.mobileMoneyEnabled
            }
          >
            {({ getFieldValue }) =>
              getFieldValue('mobileMoneyEnabled') && (
                <div className='ml-6 space-y-4 mt-4 p-4 bg-gray-50 rounded-lg'>
                  <Form.Item
                    label='Numéro Mobile Money'
                    name='mobileMoneyNumber'
                    rules={[
                      {
                        required: getFieldValue('mobileMoneyEnabled'),
                        message: 'Veuillez entrer votre numéro',
                      },
                    ]}
                  >
                    <Input size='large' placeholder='Ex: +237 6XX XXX XXX' />
                  </Form.Item>

                  <Form.Item
                    label='Nom du compte'
                    name='mobileMoneyName'
                    rules={[
                      {
                        required: getFieldValue('mobileMoneyEnabled'),
                        message: 'Veuillez entrer le nom du compte',
                      },
                    ]}
                  >
                    <Input size='large' placeholder='Ex: Jean Dupont' />
                  </Form.Item>

                  <Form.Item
                    name='mobileMoneyRequireProof'
                    valuePropName='checked'
                  >
                    <Checkbox>
                      Demander une preuve de paiement aux clients
                    </Checkbox>
                  </Form.Item>
                </div>
              )
            }
          </Form.Item>
        </Card>

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
            Continuer
          </Button>
        </div>
      </Form>
    </OnboardingLayout>
  )
}
