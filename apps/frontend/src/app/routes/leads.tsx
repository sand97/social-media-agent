import {
  ApartmentOutlined,
  ArrowRightOutlined,
  TagsOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { DashboardHeader } from '@app/components/layout'
import { Button, Card, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'

const { Paragraph, Title } = Typography

const LEADS_BENEFITS = [
  {
    icon: <TagsOutlined className='text-lg' />,
    title: 'Repérez rapidement vos contacts prioritaires',
    description:
      'Retrouvez au même endroit les conversations à suivre, les demandes chaudes et les personnes à relancer.',
  },
  {
    icon: <ApartmentOutlined className='text-lg' />,
    title: 'Suivez vos prochaines actions sans perdre le fil',
    description:
      'La page Leads vous aidera à visualiser les étapes importantes, du premier contact jusqu’à la conversion.',
  },
  {
    icon: <TeamOutlined className='text-lg' />,
    title: 'Gardez une vue claire sur vos opportunités',
    description:
      'Vos labels resteront la base pour mieux organiser les conversations et gagner du temps au quotidien.',
  },
]

export function meta() {
  return [
    { title: 'Leads - WhatsApp Agent' },
    {
      name: 'description',
      content: 'Page Leads du dashboard WhatsApp Agent',
    },
  ]
}

export default function LeadsPage() {
  const navigate = useNavigate()

  return (
    <>
      <DashboardHeader title='Leads' />

      <div className='flex w-full flex-col gap-6 px-4 py-5 sm:px-6 sm:py-6'>
        <Card className='overflow-hidden' styles={{ body: { padding: 0 } }}>
          <div className='relative overflow-hidden rounded-[24px] bg-[linear-gradient(135deg,#111b21_0%,#153b2b_55%,#24d366_100%)] px-6 py-7 text-white sm:px-8 sm:py-8'>
            <div className='absolute -right-12 top-0 h-40 w-40 rounded-full bg-white/8 blur-2xl' />
            <div className='absolute bottom-0 left-0 h-28 w-28 -translate-x-10 translate-y-10 rounded-full bg-black/15 blur-2xl' />

            <div className='relative flex flex-col gap-4'>
              <div className='max-w-3xl'>
                <Title level={3} className='!mb-2 !text-white'>
                  Retrouvez bientôt ici les conversations à suivre en priorité.
                </Title>
                <Paragraph className='!mb-0 !text-white/80'>
                  Vous y retrouverez vos contacts à relancer, vos opportunités
                  actives et les échanges à traiter en premier. En attendant,
                  vous pouvez déjà organiser vos labels et nous dire ce qui vous
                  serait le plus utile.
                </Paragraph>
              </div>

              <div className='flex flex-col gap-3 sm:flex-row'>
                <Button
                  type='primary'
                  shape='round'
                  icon={<ArrowRightOutlined />}
                  iconPosition='end'
                  onClick={() =>
                    navigate('/support', {
                      state: {
                        category: 'amelioration',
                        subject: 'Besoin autour de la page Leads',
                      },
                    })
                  }
                >
                  Nous dire ce dont vous avez besoin
                </Button>
                <Button
                  shape='round'
                  className='!border-white/30 !bg-white/10 !text-white'
                  onClick={() => navigate('/context')}
                >
                  Organiser mes labels
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <div className='grid grid-cols-1 gap-4 lg:grid-cols-3'>
          {LEADS_BENEFITS.map(step => (
            <Card
              key={step.title}
              className='h-full'
              styles={{ body: { padding: 24 } }}
            >
              <div className='flex h-full flex-col gap-4'>
                <div className='flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f4fbf7] text-[#178f57]'>
                  {step.icon}
                </div>
                <div>
                  <Title level={5} className='!mb-2'>
                    {step.title}
                  </Title>
                  <Paragraph className='!mb-0 text-[#5b5b5b]'>
                    {step.description}
                  </Paragraph>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </>
  )
}
