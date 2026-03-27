import { Spin } from 'antd'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth'

export function meta() {
  return [
    { title: 'WhatsApp Agent - Accueil' },
    {
      name: 'description',
      content: 'Plateforme de gestion WhatsApp Business avec IA',
    },
  ]
}

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        // Rediriger vers la page de login si non connecté
        navigate('/auth/login', { replace: true })
      } else {
        // Rediriger vers le dashboard si connecté
        navigate('/dashboard', { replace: true })
      }
    }
  }, [isAuthenticated, isLoading, navigate])

  // Afficher un loader pendant la vérification
  return (
    <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center'>
      <div className='text-center'>
        <Spin size='large' />
        <p className='mt-4 text-gray-600'>Chargement...</p>
      </div>
    </div>
  )
}
