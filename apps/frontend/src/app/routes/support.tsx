import {
  CustomerServiceOutlined,
  MessageOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'
import { DashboardHeader } from '@app/components/layout'
import { SupportFeedbackModal } from '@app/components/support'
import { ActionCard } from '@app/components/ui'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

type SupportLocationState = {
  category?: string
  subject?: string
}

export function meta() {
  return [
    { title: 'Support - WhatsApp Agent' },
    {
      name: 'description',
      content:
        'Point d’entrée support avec FAQ, assistance IA et formulaire Sentry',
    },
  ]
}

export default function SupportPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state || {}) as SupportLocationState
  const [contactModalOpen, setContactModalOpen] = useState(false)

  return (
    <>
      <DashboardHeader title='Support et Aides' />

      <div className='w-full space-y-4 px-4 py-5 sm:px-6 sm:py-6'>
        <div className='merge-border-radius grid gap-2'>
          <ActionCard
            title='Lire nos questions reponses'
            subtitle='Consulter les questions les plus souvent poser par les clients et leurs réponses'
            actionLabel='Lire la FAQ'
            icon={<QuestionCircleOutlined />}
            onAction={() => navigate('/faq')}
          />

          <ActionCard
            title='Discuter avec un de nos agent IA'
            subtitle='Obtenez une réponse instantanée d’un agent qui maitrise parfaitement votre entreprise'
            actionLabel='Poser une question'
            icon={<MessageOutlined />}
            onAction={() => navigate('/context')}
          />

          <ActionCard
            title='Discuter avec un membre du support'
            subtitle='Envoyer nous un message pour recevoir une réponse dans les 24h au plus tard'
            actionLabel='Envoyer un message'
            icon={<CustomerServiceOutlined />}
            onAction={() => setContactModalOpen(true)}
          />
        </div>
      </div>

      <SupportFeedbackModal
        open={contactModalOpen}
        onClose={() => setContactModalOpen(false)}
        initialCategory={state.category}
        subject={state.subject}
      />
    </>
  )
}
