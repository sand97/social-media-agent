import {
  ArrowRightOutlined,
  InfoCircleOutlined,
  TagOutlined,
} from '@ant-design/icons'
import RocketIcon from '@app/assets/Rocket.svg?react'
import { useAuth } from '@app/hooks/useAuth'
import apiClient from '@app/lib/api/client'
import { App, Button, Card, Typography, Modal, Input, Alert } from 'antd'
import Form from 'antd/es/form'
import FormItem from 'antd/es/form/FormItem'
import { useState, useEffect } from 'react'

const { Text, Link } = Typography

interface FormValues {
  labelName: string
}

export function AgentProductionCard() {
  const { user, checkAuth } = useAuth()
  const { notification } = App.useApp()
  const agentConfig = user?.agentConfig

  const [form] = Form.useForm<FormValues>()
  const labelNameValue = Form.useWatch('labelName', form)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (agentConfig?.labelsToNotReply?.[0]) {
      form.setFieldValue('labelName', agentConfig.labelsToNotReply[0])
    }
  }, [agentConfig?.labelsToNotReply, form])

  const handleOpenModal = () => {
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
  }

  const handleSave = async (values: FormValues) => {
    const labelName = values.labelName.trim()

    setLoading(true)
    try {
      await apiClient.patch('/whatsapp-agents/config', {
        labelsToNotReply: [labelName],
        productionEnabled: true,
      })
      notification.success({
        message: 'IA activée en production',
      })
      handleCloseModal()
      checkAuth()
    } catch (error) {
      console.error('Failed to save config:', error)
      notification.error({
        message: 'Erreur lors de la sauvegarde',
        description:
          error instanceof Error ? error.message : 'La configuration a échoué.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Card className='h-full'>
        <div className='flex flex-col gap-4 w-full'>
          <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
            <div className='w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center'>
              <RocketIcon className='w-5 h-5' />
            </div>
            <Button
              type='primary'
              shape='round'
              icon={<ArrowRightOutlined />}
              iconPosition='end'
              onClick={handleOpenModal}
            >
              {agentConfig?.productionEnabled ? 'Configurer' : "Activer l'IA"}
            </Button>
          </div>
          <div>
            <Text strong className='block mb-1'>
              Activer l&apos;IA pour tout vos contacts
            </Text>
            <Text type='secondary'>
              {agentConfig?.productionEnabled ? (
                <>
                  L&apos;IA est activée.{' '}
                  {(agentConfig?.labelsToNotReply?.length ?? 0) > 0 &&
                    `Label "${agentConfig?.labelsToNotReply?.[0]}" configuré.`}{' '}
                  <Link underline onClick={handleOpenModal}>
                    Modifier
                  </Link>
                </>
              ) : (
                <>
                  L&apos;IA répondra à tous les contacts sauf aux contacts
                  exclus. <Link onClick={handleOpenModal}>Configurer</Link>
                </>
              )}
            </Text>
          </div>
        </div>
      </Card>

      <Modal
        title='Configuration du mode production'
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
            onClick={() => form.submit()}
          >
            Sauvegarder
          </Button>,
        ]}
        width={600}
      >
        <Form
          form={form}
          layout='vertical'
          onFinish={handleSave}
          initialValues={{
            labelName: "Désactiver l'IA",
          }}
        >
          <div className='flex flex-col gap-6 py-4'>
            <div>
              <FormItem
                name='labelName'
                label="Label d'exclusion"
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
                      votre WhatsApp. Pour exclure un contact des réponses
                      automatiques, ajoutez simplement ce label à sa
                      conversation.
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
