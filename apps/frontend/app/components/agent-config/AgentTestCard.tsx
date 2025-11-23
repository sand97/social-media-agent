import {
  ArrowRightOutlined,
  InfoCircleOutlined,
  TagOutlined,
} from '@ant-design/icons'
import TestIcon from '@app/assets/Test.svg?react'
import { useAuth } from '@app/hooks/useAuth'
import apiClient from '@app/lib/api/client'
import { Button, Card, Typography, Modal, Input, message, Alert } from 'antd'
import Form from 'antd/es/form'
import FormItem from 'antd/es/form/FormItem'
import { useState, useEffect } from 'react'

const { Text } = Typography

interface FormValues {
  labelName: string
}

export function AgentTestCard() {
  const { user, checkAuth } = useAuth()
  const agentConfig = user?.agentConfig

  const [form] = Form.useForm<FormValues>()
  const labelNameValue = Form.useWatch('labelName', form)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (agentConfig?.testLabels?.[0]) {
      form.setFieldValue('labelName', agentConfig.testLabels[0])
    }
  }, [agentConfig?.testLabels, form])

  const handleOpenModal = () => {
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    const labelName = values.labelName.trim()

    setLoading(true)
    try {
      await apiClient.patch('/whatsapp-agents/config', {
        testLabels: [labelName],
      })
      message.success('Configuration sauvegardée')
      handleCloseModal()
      checkAuth()
    } catch (error) {
      console.error('Failed to save config:', error)
      message.error('Erreur lors de la sauvegarde')
    } finally {
      setLoading(false)
    }
  }

  const hasConfig = (agentConfig?.testLabels?.length ?? 0) > 0

  return (
    <>
      <Card
        className='h-full'
        styles={{
          body: { padding: 24 },
        }}
      >
        <div className='flex flex-col gap-4 w-full'>
          <div className='flex items-start justify-between'>
            <div className='w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center'>
              <TestIcon className='w-5 h-5' />
            </div>
            <Button
              type='default'
              shape='round'
              icon={<ArrowRightOutlined />}
              iconPosition='end'
              onClick={handleOpenModal}
            >
              Configurer
            </Button>
          </div>
          <div>
            <Text strong className='block mb-1'>
              Test avec un contact ou des Tags
            </Text>
            <Text type='secondary'>
              {hasConfig
                ? `Label "${agentConfig?.testLabels?.[0]}" configuré`
                : "L'IA ne répondra que pour les contacts avec le label configuré"}
            </Text>
          </div>
        </div>
      </Card>

      <Modal
        title='Configuration du mode test'
        open={isModalOpen}
        onCancel={handleCloseModal}
        footer={[
          <Button key='cancel' onClick={handleCloseModal}>
            Annuler
          </Button>,
          <Button
            key='save'
            type='primary'
            loading={loading}
            onClick={handleSave}
          >
            Sauvegarder
          </Button>,
        ]}
        width={600}
      >
        <Form
          form={form}
          layout='vertical'
          initialValues={{
            labelName: 'Test avec IA',
          }}
        >
          <div className='flex flex-col gap-6 py-4'>
            <div>
              <FormItem
                name='labelName'
                label='Label de test'
                rules={[
                  {
                    required: true,
                    message: 'Veuillez entrer un nom de label',
                  },
                ]}
              >
                <Input placeholder='Nom du label' prefix={<TagOutlined />} />
              </FormItem>

              {labelNameValue?.trim() && (
                <Alert
                  message='Comment ça marche ?'
                  description={
                    <>
                      Nous allons créer le label{' '}
                      <strong>&quot;{labelNameValue.trim()}&quot;</strong> sur
                      votre WhatsApp. Pour tester l&apos;IA, ajoutez simplement
                      ce label aux conversations de votre choix.
                    </>
                  }
                  type='info'
                  showIcon
                  icon={<InfoCircleOutlined />}
                />
              )}
            </div>
          </div>
        </Form>
      </Modal>
    </>
  )
}
