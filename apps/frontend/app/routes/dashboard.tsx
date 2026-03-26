import {
  ArrowRightOutlined,
  MessageOutlined,
  RiseOutlined,
} from '@ant-design/icons'
import {
  AgentProductionCard,
  AgentTestCard,
} from '@app/components/agent-config'
import {
  GoogleBrandIcon,
  FacebookBrandIcon,
} from '@app/components/icons/BrandIcons'
import { useAuth } from '@app/hooks/useAuth'
import { getPlanLabel, resolveCurrentPlanKey } from '@app/lib/current-plan'
import apiClient from '@app/lib/api/client'
import { DashboardHeader } from '@app/components/layout'
import { App, Button, Card, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const { Title, Text, Link } = Typography

export function meta() {
  return [
    { title: 'Accueil - WhatsApp Agent' },
    {
      name: 'description',
      content: 'Tableau de bord WhatsApp Agent',
    },
  ]
}

export default function DashboardPage() {
  const { user, checkAuth } = useAuth()
  const { notification } = App.useApp()
  const navigate = useNavigate()
  const [googleConnectLoading, setGoogleConnectLoading] = useState(false)
  const googleContacts = user?.googleContacts
  const currentPlanLabel = getPlanLabel(resolveCurrentPlanKey(user))

  const openModerator = () => {
    if (typeof window === 'undefined') return

    window.open(
      'https://moderator.bedones.com',
      '_blank',
      'noopener,noreferrer'
    )
  }

  const handleConnectGoogle = async () => {
    setGoogleConnectLoading(true)

    try {
      const response = await apiClient.post('/google-contacts/oauth/authorize-url')
      const authorizeUrl = response?.data?.authorizeUrl

      if (!authorizeUrl) {
        throw new Error("L'URL d'autorisation Google est manquante.")
      }

      window.location.assign(authorizeUrl)
    } catch (error) {
      console.error('Failed to start Google OAuth:', error)
      notification.error({
        message: 'Connexion Google impossible',
        description:
          error instanceof Error
            ? error.message
            : 'Le flux OAuth Google a échoué.',
      })
      setGoogleConnectLoading(false)
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    const url = new URL(window.location.href)
    const status = url.searchParams.get('googleContacts')
    const message = url.searchParams.get('message')

    if (!status) return

    if (status === 'connected') {
      notification.success({
        message: 'Google Contacts connecté',
      })
      void checkAuth()
    } else {
      notification.error({
        message: 'Connexion Google échouée',
        description: message || 'Le callback Google n’a pas abouti.',
      })
    }

    url.searchParams.delete('googleContacts')
    url.searchParams.delete('message')

    navigate(
      {
        pathname: url.pathname,
        search: url.searchParams.toString()
          ? `?${url.searchParams.toString()}`
          : '',
      },
      { replace: true }
    )
  }, [checkAuth, navigate, notification])

  return (
    <>
      <DashboardHeader title='Accueil' />

      <div className='flex w-full flex-col gap-6 px-4 py-5 sm:px-6 sm:py-6 card-button-bottom'>
        <section>
          <Title level={5} className='mb-4'>
            Tester ou passer en production
          </Title>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <AgentTestCard />
            <AgentProductionCard />
          </div>
        </section>

        <section>
          <Title level={5} className='mb-4'>
            Usages et plan
          </Title>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <Card
              className='h-full'
              styles={{
                body: { padding: 24 },
              }}
            >
              <div className='flex w-full flex-col gap-4'>
                <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
                  <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100'>
                    <MessageOutlined className='text-lg' />
                  </div>
                  <Button
                    type='default'
                    shape='round'
                    icon={<ArrowRightOutlined />}
                    iconPosition='end'
                    onClick={() => navigate('/stats')}
                  >
                    Voir les détails
                  </Button>
                </div>
                <div>
                  <Text strong className='mb-1 block'>
                    50 messages traités aujourd&apos;hui
                  </Text>
                  <Text type='secondary'>
                    Consulter plus de détails depuis la page de statistique
                  </Text>
                </div>
              </div>
            </Card>

            <Card
              className='h-full'
              styles={{
                body: { padding: 24 },
              }}
            >
              <div className='flex w-full flex-col gap-4'>
                <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
                  <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100'>
                    <RiseOutlined className='text-lg' />
                  </div>
                  <Button
                    type='primary'
                    shape='round'
                    icon={<ArrowRightOutlined />}
                    iconPosition='end'
                    onClick={() => navigate('/pricing')}
                  >
                    Voir les souscriptions
                  </Button>
                </div>
                <div>
                  <div className='mb-1 flex items-center gap-2'>
                    <Text strong>Souscription</Text>
                    <span className='rounded-full bg-[#24d366] px-2.5 py-1 text-xs font-semibold text-black'>
                      {currentPlanLabel}
                    </span>
                  </div>
                  <Text type='secondary' className='block'>
                    L&apos;IA répondra à tous les contacts sauf aux contacts
                    exclus. <Link>Exclure des contacts</Link>
                  </Text>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section>
          <Title level={5} className='mb-4'>
            Outils
          </Title>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <Card
              className='h-full'
              styles={{
                body: { padding: 24 },
              }}
            >
              <div className='flex w-full flex-col gap-4'>
                <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
                  <div className='flex h-12 w-12 items-center justify-center'>
                    <GoogleBrandIcon className='h-10 w-10' />
                  </div>
                  {googleContacts?.connected ? (
                    <span className='rounded-full bg-[#24d366] px-3 py-1 text-sm font-semibold text-black'>
                      {googleContacts.contactsCount} contacts sauvegardés
                    </span>
                  ) : (
                    <Button
                      type='default'
                      shape='round'
                      icon={<ArrowRightOutlined />}
                      iconPosition='end'
                      loading={googleConnectLoading}
                      onClick={handleConnectGoogle}
                    >
                      Connecter
                    </Button>
                  )}
                </div>
                <div>
                  <Text strong className='mb-1 block'>
                    Google Contacts
                  </Text>
                  <Text type='secondary'>
                    {googleContacts?.connected
                      ? 'Les nouveaux contacts WhatsApp sont sauvegardés automatiquement dans Google.'
                      : 'Sauvegarder automatiquement les nouveaux contacts WhatsApp dans Google.'}
                  </Text>
                </div>
              </div>
            </Card>

            <Card
              className='h-full'
              styles={{
                body: { padding: 24 },
              }}
            >
              <div className='flex w-full flex-col gap-4'>
                <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
                  <div className='flex h-12 w-12 items-center justify-center'>
                    <FacebookBrandIcon className='h-10 w-10' />
                  </div>
                  <Button
                    type='default'
                    shape='round'
                    icon={<ArrowRightOutlined />}
                    iconPosition='end'
                    onClick={openModerator}
                  >
                    Connecter
                  </Button>
                </div>
                <div>
                  <Text strong className='mb-1 block'>
                    Facebook
                  </Text>
                  <Text type='secondary'>
                    Réponses automatiquement aux commentaires sur vos pages
                  </Text>
                </div>
              </div>
            </Card>
          </div>
        </section>
      </div>
    </>
  )
}
