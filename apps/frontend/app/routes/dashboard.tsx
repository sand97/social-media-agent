import {
  ArrowRightOutlined,
  GoogleOutlined,
  FacebookOutlined,
  RiseOutlined,
  MessageOutlined,
} from '@ant-design/icons'
import {
  AgentTestCard,
  AgentProductionCard,
} from '@app/components/agent-config'
import { Button, Card, Typography, Badge } from 'antd'

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
  return (
    <div className='flex flex-col gap-6 w-full p-6'>
      {/* Section: Tester ou passer en production */}
      <section>
        <Title level={5} className='mb-4'>
          Tester ou passer en production
        </Title>
        <div className='grid grid-cols-2 gap-4'>
          <AgentTestCard />
          <AgentProductionCard />
        </div>
      </section>

      {/* Section: Plan et usage */}
      <section>
        <Title level={5} className='mb-4'>
          Plan et usage
        </Title>
        <div className='grid grid-cols-2 gap-4'>
          {/* Messages Card */}
          <Card
            className='h-full'
            styles={{
              body: { padding: 24 },
            }}
          >
            <div className='flex flex-col gap-4 w-full'>
              <div className='flex items-start justify-between'>
                <div className='w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center'>
                  <MessageOutlined className='text-lg' />
                </div>
                <Button
                  type='default'
                  shape='round'
                  icon={<ArrowRightOutlined />}
                  iconPosition='end'
                >
                  Voir les détails
                </Button>
              </div>
              <div>
                <Text strong className='block mb-1'>
                  50 messages traités aujourd&apos;hui
                </Text>
                <Text type='secondary'>
                  Consulter plus de détails depuis la page de statistique
                </Text>
              </div>
            </div>
          </Card>

          {/* Forfait Card */}
          <Card
            className='h-full'
            styles={{
              body: { padding: 24 },
            }}
          >
            <div className='flex flex-col gap-4 w-full'>
              <div className='flex items-start justify-between'>
                <div className='w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center'>
                  <RiseOutlined className='text-lg' />
                </div>
                <Button
                  type='primary'
                  shape='round'
                  icon={<ArrowRightOutlined />}
                  iconPosition='end'
                  style={{
                    backgroundColor: '#af52de',
                    borderColor: '#af52de',
                  }}
                >
                  Passer à la version Pro
                </Button>
              </div>
              <div>
                <div className='flex items-center gap-2 mb-1'>
                  <Text strong>Forfait</Text>
                  <Badge count='Free' style={{ backgroundColor: '#24d366' }} />
                </div>
                <Text type='secondary' className='block'>
                  L&apos;IA répondra à tous les contacts sauf aux contacts
                  exclu. <Link underline>Exclure des contacts</Link>
                </Text>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Section: Outils */}
      <section>
        <Title level={5} className='mb-4'>
          Outils
        </Title>
        <div className='grid grid-cols-2 gap-4'>
          {/* Google Contacts Card */}
          <Card
            className='h-full'
            styles={{
              body: { padding: 24 },
            }}
          >
            <div className='flex flex-col gap-4 w-full'>
              <div className='flex items-start justify-between'>
                <div className='w-12 h-12 flex items-center justify-center'>
                  <GoogleOutlined
                    className='text-3xl'
                    style={{ color: '#4285F4' }}
                  />
                </div>
                <Button
                  type='default'
                  shape='round'
                  icon={<ArrowRightOutlined />}
                  iconPosition='end'
                >
                  Connecter
                </Button>
              </div>
              <div>
                <Text strong className='block mb-1'>
                  Google Contacts
                </Text>
                <Text type='secondary'>
                  Sauvegarder automatiquement des nouveaux contacts pour les
                  statuts
                </Text>
              </div>
            </div>
          </Card>

          {/* Facebook Card */}
          <Card
            className='h-full'
            styles={{
              body: { padding: 24 },
            }}
          >
            <div className='flex flex-col gap-4 w-full'>
              <div className='flex items-start justify-between'>
                <div className='w-12 h-12 flex items-center justify-center'>
                  <FacebookOutlined
                    className='text-3xl'
                    style={{ color: '#1877F2' }}
                  />
                </div>
                <Button
                  type='default'
                  shape='round'
                  icon={<ArrowRightOutlined />}
                  iconPosition='end'
                >
                  Connecter
                </Button>
              </div>
              <div>
                <Text strong className='block mb-1'>
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
  )
}
