import {
  QuestionCircleOutlined,
  CustomerServiceOutlined,
  ShopOutlined,
  ArrowUpOutlined,
  StopOutlined,
  RightOutlined,
} from '@ant-design/icons'
import RocketIcon from '@app/assets/Rocket.svg?react'
import TestIcon from '@app/assets/Test.svg?react'
import { useAuth } from '@app/hooks/useAuth'
import apiClient from '@app/lib/api/client'
import { App, Button, Input, Modal, Skeleton, Spin } from 'antd'
import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { io, Socket } from 'socket.io-client'

interface ThreadMessage {
  id: string
  threadId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata?: {
    score?: number
    context?: string
    needs?: string[]
  }
  createdAt: string
}

interface OnboardingThread {
  id: string
  userId: string
  score: number
  context?: string
  needs?: string[]
  status: 'in_progress' | 'completed'
  messages: ThreadMessage[]
}

export function meta() {
  return [
    { title: "Contexte de l'IA - WhatsApp Agent" },
    {
      name: 'description',
      content: "Configurez le contexte de l'IA pour améliorer les réponses",
    },
  ]
}

export default function ContextOnboardingPage() {
  const { notification } = App.useApp()
  const { user, updateContextScore } = useAuth()
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [thread, setThread] = useState<OnboardingThread | null>(null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [score, setScore] = useState(user?.contextScore ?? 0)
  const [loadingStatus, setLoadingStatus] = useState<string>(
    'Réflexion en cours...'
  )
  const [showActivationModal, setShowActivationModal] = useState(false)
  const [hasShownModal, setHasShownModal] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messagesEndRef = useRef<any>(null)
  const updateContextScoreRef = useRef(updateContextScore)

  // Keep ref updated
  useEffect(() => {
    updateContextScoreRef.current = updateContextScore
  }, [updateContextScore])

  // Helper to update score in both local state and AuthContext
  const handleScoreUpdate = (newScore: number) => {
    setScore(newScore)
    updateContextScoreRef.current(newScore)
  }

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Show activation modal when score reaches 80%
  useEffect(() => {
    if (score >= 80 && !hasShownModal && !isLoading) {
      setShowActivationModal(true)
      setHasShownModal(true)
    }
  }, [score, hasShownModal, isLoading])

  // Fetch thread and connect to WebSocket on mount
  useEffect(() => {
    const fetchThread = async () => {
      try {
        const response = await apiClient.get<OnboardingThread>(
          '/onboarding/threads'
        )
        if (response.data) {
          setThread(response.data)
          setMessages(response.data.messages || [])
          handleScoreUpdate(response.data.score || 0)
        }
      } catch (error: unknown) {
        const err = error as { response?: { status?: number } }
        // Thread might not exist yet, that's okay
        if (err.response?.status !== 404) {
          console.error('Failed to fetch thread:', error)
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchThread()

    // Connect to WebSocket
    const token = localStorage.getItem('auth_token')
    if (!token) return

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'

    const socket = io(`${apiUrl}/onboarding`, {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5, // Limit reconnection attempts
      reconnectionDelay: 1000,
    })

    socket.on('connect', () => {
      console.log('Connected to onboarding WebSocket')
    })

    socket.on('connect_error', error => {
      console.error('WebSocket connection error:', error)
    })

    // Listen for AI messages
    socket.on(
      'onboarding:ai_message',
      (data: {
        message: string
        score?: number
        context?: string
        needs?: string[]
      }) => {
        const newMessage: ThreadMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Unique ID
          threadId: '',
          role: 'assistant',
          content: data.message,
          metadata: {
            score: data.score,
            context: data.context,
            needs: data.needs,
          },
          createdAt: new Date().toISOString(),
        }
        setMessages(prev => [...prev, newMessage])
        setIsSubmitting(false)

        if (data.score !== undefined) {
          handleScoreUpdate(data.score)
        }
      }
    )

    // Listen for score updates
    socket.on('score:updated', (data: { score: number }) => {
      handleScoreUpdate(data.score)
    })

    // Listen for tool execution status
    socket.on('onboarding:tool_executing', (data: { toolName: string }) => {
      // Map tool names to user-friendly messages
      const toolMessages: Record<string, string> = {
        getAllGroups: 'Récupération des groupes...',
        getAllLabels: 'Récupération des labels...',
        getContactList: 'Récupération des contacts...',
        getMyProfileName: 'Récupération du profil...',
        getCollections: 'Récupération des collections...',
        getMessages: 'Récupération des messages...',
        addNewLabel: 'Création du label...',
        editLabel: 'Modification du label...',
        deleteLabel: 'Suppression du label...',
        createGroup: 'Création du groupe...',
        getProductsFromCollection: 'Récupération des produits...',
        readBusinessProfile: 'Lecture du profil business...',
        readProducts: 'Lecture des produits...',
        updateContext: 'Mise à jour du contexte...',
        updateNeeds: 'Mise à jour des besoins...',
      }
      setLoadingStatus(
        toolMessages[data.toolName] || `Exécution de ${data.toolName}...`
      )
    })

    // Listen for thinking status
    socket.on('onboarding:thinking', (data: { isThinking: boolean }) => {
      if (data.isThinking) {
        setLoadingStatus('Réflexion en cours...')
      }
    })

    // Listen for cancellation confirmation
    socket.on(
      'onboarding:cancelled',
      (data: { success: boolean; restoredContent: string | null }) => {
        setIsSubmitting(false)
        setLoadingStatus('Réflexion en cours...')

        // Restore the message to the input
        if (data.restoredContent) {
          setInputValue(data.restoredContent)
        }

        // Remove the last user message from the UI
        setMessages(prev => {
          const lastUserIndex = prev.findLastIndex(m => m.role === 'user')
          if (lastUserIndex !== -1) {
            return [
              ...prev.slice(0, lastUserIndex),
              ...prev.slice(lastUserIndex + 1),
            ]
          }
          return prev
        })
      }
    )

    socketRef.current = socket

    return () => {
      socket.disconnect()
    }
  }, [])

  const handleCancel = () => {
    if (socketRef.current && isSubmitting) {
      socketRef.current.emit('client:cancel')
    }
  }

  const handleSubmit = async () => {
    if (!inputValue.trim()) return

    setIsSubmitting(true)
    setLoadingStatus('Réflexion en cours...')

    // Add user message immediately for better UX
    const userMessage: ThreadMessage = {
      id: `user-${Date.now()}`,
      threadId: thread?.id || '',
      role: 'user',
      content: inputValue,
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMessage])

    const messageContent = inputValue
    setInputValue('')

    try {
      // Send message to backend
      await apiClient.post('/onboarding/messages', {
        content: messageContent,
      })
      // Response will come via WebSocket
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      notification.error({
        message: 'Erreur',
        description: err.response?.data?.message || 'Une erreur est survenue',
      })
      setIsSubmitting(false)
    }
  }

  const getScoreColor = (scoreValue: number) => {
    if (scoreValue >= 80) return 'border-[#24d366] text-[#24d366]'
    if (scoreValue >= 50) return 'border-[#ff9500] text-[#111b21]'
    return 'border-[#ff9500] text-[#111b21]'
  }

  return (
    <div className='flex h-full flex-col gap-2.5'>
      {/* Header */}
      <div className='pb-6'>
        <div className='mb-2 flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <QuestionCircleOutlined className='text-lg' />
            <h1 className='m-0 text-xl font-semibold leading-7 tracking-tight text-[#111b21]'>
              Conversation d&apos;initialisation
            </h1>
          </div>
          <div
            className={`flex h-[46px] items-center justify-center rounded-full border px-4 py-0 ${getScoreColor(score)}`}
          >
            <span className='text-sm font-semibold tracking-wide'>
              Score • {score}%
            </span>
          </div>
        </div>
        <p className='m-0 text-base leading-7 tracking-tight text-[#111b21]'>
          Cette conversation est utilisée pour améliorer les compétences de
          l&apos;IA et ses réponses à vos contacts
        </p>
      </div>

      {/* Messages Container */}
      <div className='flex-1 space-y-4 overflow-y-auto border-t border-gray-100 py-4'>
        {isLoading ? (
          <div className='space-y-4'>
            <Skeleton active avatar paragraph={{ rows: 2 }} />
            <Skeleton active avatar paragraph={{ rows: 2 }} />
          </div>
        ) : messages.length === 0 ? (
          <div className='py-8 text-center text-gray-500'>
            <Spin size='large' />
            <p className='mt-4'>
              En attente de l&apos;analyse initiale de l&apos;IA...
            </p>
          </div>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-[#24d366] text-white'
                    : 'bg-gray-100 text-[#111b21]'
                }`}
              >
                <p className='m-0 whitespace-pre-wrap text-sm'>{msg.content}</p>
              </div>
            </div>
          ))
        )}

        {/* Loading indicator for AI response */}
        {isSubmitting && (
          <div className='flex gap-3'>
            <div className='max-w-[80%] rounded-2xl bg-gray-100 px-4 py-3'>
              <div className='flex items-center gap-3'>
                <Spin size='small' />
                <span className='text-sm text-gray-600'>{loadingStatus}</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - Always visible */}
      {!isLoading && (
        <div className='rounded-[40px] bg-white p-4 shadow-[0px_0px_1px_0px_rgba(0,0,0,0.4)]'>
          <div className='mb-2 flex items-start gap-4 rounded-3xl bg-[#fdfdfd] px-4 py-2.5 shadow-[0px_0px_1px_0px_rgba(0,0,0,0.4)]'>
            <Input.TextArea
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onPressEnter={e => {
                if (!e.shiftKey) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
              placeholder='Écrivez votre réponse... (Entrée pour envoyer, Shift+Entrée pour nouvelle ligne)'
              variant='borderless'
              className='flex-1 text-sm'
              disabled={isSubmitting}
              autoSize={{ minRows: 1, maxRows: 6 }}
              style={{ resize: 'none' }}
            />
            {isSubmitting ? (
              <Button
                type='default'
                shape='circle'
                size='large'
                icon={<StopOutlined />}
                onClick={handleCancel}
                danger
                className='mt-1 border-none !h-10 !w-10 !py-0'
              />
            ) : (
              <Button
                type='primary'
                shape='circle'
                size='large'
                icon={<ArrowUpOutlined />}
                onClick={handleSubmit}
                disabled={!inputValue.trim()}
                className='mt-1 border-none !h-10 !w-10 !py-0'
              />
            )}
          </div>

          {/* Quick Action Buttons */}
          <div className='flex gap-2'>
            <Button
              type='default'
              className='flex h-auto items-center gap-2 rounded-full border-none bg-white px-4 py-3 shadow-[0px_0px_1px_0px_rgba(0,0,0,0.4)]'
            >
              <CustomerServiceOutlined />
              <span className='text-sm font-medium tracking-tight text-[#050505]'>
                Support
              </span>
            </Button>
            <Button
              type='default'
              className='flex h-auto items-center gap-2 rounded-full border-none bg-white px-4 py-3 shadow-[0px_0px_1px_0px_rgba(0,0,0,0.4)]'
            >
              <ShopOutlined />
              <span className='text-sm font-medium tracking-tight text-[#050505]'>
                Stratégie de vente
              </span>
            </Button>
          </div>
        </div>
      )}

      {/* Activation Modal */}
      <Modal
        open={showActivationModal}
        onCancel={() => setShowActivationModal(false)}
        footer={null}
        centered
        width={800}
        className='activation-modal'
      >
        <div className='flex flex-col gap-6'>
          <div>
            <h2 className='m-0 mb-2 text-xl font-semibold text-black'>
              Votre IA est prête !
            </h2>
            <p className='m-0 text-sm'>
              Vous pouvez maintenant activer votre agent ou continuer à fournir
              des informations pour le rendre plus précis.
            </p>
          </div>

          {/* Cards container - vertical on mobile, horizontal on desktop */}
          <div className='flex flex-col gap-2 md:flex-row'>
            {/* Test Card */}
            <div className='flex flex-1 flex-col gap-12 rounded-[20px] bg-white px-6 py-4 shadow-[0px_0px_1px_0px_rgba(0,0,0,0.4)]'>
              <div className='flex items-center justify-between'>
                <div className='flex size-12 items-center justify-center rounded-full bg-white shadow-[0px_0px_1px_0px_rgba(0,0,0,0.4)]'>
                  <TestIcon className='size-6' />
                </div>
                <Button type='default' variant='outlined' icon={<RightOutlined />} iconPosition='end'>
                  Configurer
                </Button>
              </div>
              <div className='flex flex-col gap-2'>
                <p className='m-0 text-base font-medium text-black'>
                  Test avec un contact ou des Tags
                </p>
                <p className='m-0 text-sm leading-6'>
                  L&apos;IA ne répondra que pour les contacts ou les Tags
                  sélectionner
                </p>
              </div>
            </div>

            {/* Activate Card */}
            <div className='flex flex-1 flex-col gap-12 rounded-[20px] bg-white px-6 py-4 shadow-[0px_0px_1px_0px_rgba(0,0,0,0.4)]'>
              <div className='flex items-center justify-between'>
                <div className='flex size-12 items-center justify-center rounded-full bg-white shadow-[0px_0px_1px_0px_rgba(0,0,0,0.4)]'>
                  <RocketIcon className='size-6' />
                </div>
                <Button type='primary' variant='outlined' icon={<RightOutlined />} iconPosition='end'>
                  Activer l&apos;IA
                </Button>
              </div>
              <div className='flex flex-col gap-2'>
                <p className='m-0 text-base font-medium text-black'>
                  Activer l&apos;IA pour tout vos contacts
                </p>
                <p className='m-0 text-sm leading-6'>
                  L&apos;IA répondra à tous les contacts sauf aux contacts
                  exclu.{' '}
                  <Link to='#'>
                    Exclure des contacts
                  </Link>
                </p>
              </div>
            </div>
          </div>

          <Button
            variant='outlined'
            onClick={() => setShowActivationModal(false)}
            className='self-center'
          >
            Continuer à améliorer le contexte
          </Button>
        </div>
      </Modal>
    </div>
  )
}
