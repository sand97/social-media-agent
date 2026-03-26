import { ArrowUpOutlined, EditOutlined, StopOutlined } from '@ant-design/icons'
import {
  AgentProductionCard,
  AgentTestCard,
} from '@app/components/agent-config'
import { DashboardHeader } from '@app/components/layout'
import { CollapsibleCard } from '@app/components/ui'
import { useAuth } from '@app/hooks/useAuth'
import apiClient from '@app/lib/api/client'
import { App, Button, Input, Modal, Skeleton, Spin, Typography } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'

const { Text } = Typography

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

type ParsedBlock =
  | {
      items: string[]
      type: 'list'
    }
  | {
      text: string
      type: 'paragraph'
    }

type ParsedSection = {
  blocks: ParsedBlock[]
  id: string
  summary: string
  title: string
}

function renderInlineMarkdown(text: string) {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((segment, index) => {
    if (segment.startsWith('**') && segment.endsWith('**')) {
      return (
        <strong key={`${segment}-${index}`}>
          {segment.slice(2, segment.length - 2)}
        </strong>
      )
    }

    if (segment.startsWith('`') && segment.endsWith('`')) {
      return (
        <code
          key={`${segment}-${index}`}
          className='rounded-lg bg-[var(--color-surface-accent)] px-1.5 py-0.5 text-[13px] text-[var(--color-text-primary)]'
        >
          {segment.slice(1, segment.length - 1)}
        </code>
      )
    }

    return segment
  })
}

function parseMarkdownSections(markdown: string): ParsedSection[] {
  const normalized = markdown.trim()

  if (!normalized) {
    return []
  }

  const lines = normalized.split(/\r?\n/)
  const sections: Array<{ body: string[]; title: string }> = []
  let currentTitle = 'Résumé'
  let currentBody: string[] = []

  const flushSection = () => {
    const body = currentBody.join('\n').trim()

    if (body) {
      sections.push({
        body: body.split('\n'),
        title: currentTitle,
      })
    }

    currentBody = []
  }

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.*)$/)

    if (headingMatch) {
      flushSection()
      currentTitle = headingMatch[1].trim() || 'Section'
      continue
    }

    currentBody.push(line)
  }

  flushSection()

  return sections.map((section, index) => {
    const blocks: ParsedBlock[] = []
    let buffer: string[] = []

    const flushBlock = () => {
      if (buffer.length === 0) {
        return
      }

      const isList = buffer.every(line => /^[-*]\s+/.test(line))

      if (isList) {
        blocks.push({
          items: buffer.map(line => line.replace(/^[-*]\s+/, '').trim()),
          type: 'list',
        })
      } else {
        blocks.push({
          text: buffer.join('\n').trim(),
          type: 'paragraph',
        })
      }

      buffer = []
    }

    for (const line of section.body) {
      if (!line.trim()) {
        flushBlock()
        continue
      }

      buffer.push(line.trim())
    }

    flushBlock()

    const summarySource = blocks[0]
    const rawSummary =
      summarySource?.type === 'list'
        ? summarySource.items.join('\n')
        : summarySource?.text || ''
    const summary = rawSummary
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')

    return {
      blocks,
      id: `${section.title}-${index}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, ''),
      summary,
      title: section.title,
    }
  })
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
  const [contextMarkdown, setContextMarkdown] = useState('')
  const [loadingStatus, setLoadingStatus] = useState<string>(
    'Réflexion en cours...'
  )
  const [showActivationModal, setShowActivationModal] = useState(false)
  const [hasShownModal, setHasShownModal] = useState(false)
  const [hasRequestedInitialAnalysis, setHasRequestedInitialAnalysis] =
    useState(false)
  const [viewMode, setViewMode] = useState<'chat' | 'summary'>('chat')
  const [expandedSections, setExpandedSections] = useState<string[]>([])
  const socketRef = useRef<Socket | null>(null)
  const messagesEndRef = useRef<{
    scrollIntoView: (options?: { behavior?: 'auto' | 'smooth' }) => void
  } | null>(null)
  const updateContextScoreRef = useRef(updateContextScore)
  const initialUserScoreRef = useRef(user?.contextScore ?? 0)
  const initialViewModeSetRef = useRef(false)

  const parsedSections = useMemo(
    () => parseMarkdownSections(contextMarkdown),
    [contextMarkdown]
  )
  const allSectionsExpanded =
    parsedSections.length > 0 &&
    expandedSections.length === parsedSections.length

  useEffect(() => {
    updateContextScoreRef.current = updateContextScore
  }, [updateContextScore])

  useEffect(() => {
    setExpandedSections(previous =>
      previous.filter(sectionId =>
        parsedSections.some(section => section.id === sectionId)
      )
    )
  }, [parsedSections])

  const setInitialViewMode = (nextScore: number, nextContext?: string) => {
    if (initialViewModeSetRef.current) {
      return
    }

    initialViewModeSetRef.current = true
    setViewMode(
      nextScore >= 80 && Boolean(nextContext?.trim()) ? 'summary' : 'chat'
    )
  }

  const handleScoreUpdate = (newScore: number) => {
    setScore(newScore)
    updateContextScoreRef.current(newScore)
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const hasConfiguredAgent =
      (user?.agentConfig?.testPhoneNumbers?.length ?? 0) > 0 ||
      (user?.agentConfig?.testLabels?.length ?? 0) > 0 ||
      (user?.agentConfig?.labelsToNotReply?.length ?? 0) > 0 ||
      user?.agentConfig?.productionEnabled === true

    if (score >= 80 && !hasShownModal && !isLoading && !hasConfiguredAgent) {
      setShowActivationModal(true)
      setHasShownModal(true)
    }
  }, [score, hasShownModal, isLoading, user?.agentConfig])

  useEffect(() => {
    const fetchThread = async () => {
      try {
        const response = await apiClient.get<OnboardingThread>(
          '/onboarding/threads'
        )

        if (response.data) {
          setThread(response.data)
          setMessages(response.data.messages || [])
          setContextMarkdown(response.data.context || '')
          handleScoreUpdate(response.data.score || 0)
          setInitialViewMode(response.data.score || 0, response.data.context)
        }
      } catch (error: unknown) {
        const err = error as { response?: { status?: number } }

        if (err.response?.status !== 404) {
          console.error('Failed to fetch thread:', error)
        }

        setInitialViewMode(initialUserScoreRef.current, '')
      } finally {
        setIsLoading(false)
      }
    }

    fetchThread()

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'
    const socket = io(`${apiUrl}/onboarding`, {
      withCredentials: true,
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    socket.on('connect', () => {
      console.log('Connected to onboarding WebSocket')
    })

    socket.on('connect_error', error => {
      console.error('WebSocket connection error:', error)
    })

    socket.on(
      'onboarding:ai_message',
      (data: {
        message: string
        score?: number
        context?: string
        needs?: string[]
      }) => {
        const newMessage: ThreadMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
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

        if (data.context !== undefined) {
          setContextMarkdown(data.context)
        }

        if (data.score !== undefined) {
          handleScoreUpdate(data.score)
        }
      }
    )

    socket.on('score:updated', (data: { score: number }) => {
      handleScoreUpdate(data.score)
    })

    socket.on('onboarding:tool_executing', (data: { toolName: string }) => {
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

    socket.on('onboarding:thinking', (data: { isThinking: boolean }) => {
      if (data.isThinking) {
        setLoadingStatus('Réflexion en cours...')
      }
    })

    socket.on(
      'onboarding:cancelled',
      (data: { success: boolean; restoredContent: string | null }) => {
        setIsSubmitting(false)
        setLoadingStatus('Réflexion en cours...')

        if (data.restoredContent) {
          setInputValue(data.restoredContent)
        }

        setMessages(prev => {
          const reversedIndex = [...prev]
            .reverse()
            .findIndex(message => message.role === 'user')

          if (reversedIndex === -1) return prev
          const lastUserIndex = prev.length - 1 - reversedIndex

          return [
            ...prev.slice(0, lastUserIndex),
            ...prev.slice(lastUserIndex + 1),
          ]
        })
      }
    )

    socket.on(
      'onboarding:error',
      (data: { message: string; retryable: boolean; type: string }) => {
        setIsSubmitting(false)
        setLoadingStatus('Réflexion en cours...')

        notification.error({
          message: 'Erreur technique',
          description: data.message,
          duration: data.retryable ? 10 : 0,
        })

        if (data.retryable) {
          setMessages(prev => {
            const reversedIndex = [...prev]
              .reverse()
              .findIndex(message => message.role === 'user')

            if (reversedIndex === -1) return prev
            const lastUserIndex = prev.length - 1 - reversedIndex
            const lastUserMessage = prev[lastUserIndex]

            if (lastUserMessage) {
              setInputValue(lastUserMessage.content)
            }

            return [
              ...prev.slice(0, lastUserIndex),
              ...prev.slice(lastUserIndex + 1),
            ]
          })
        }
      }
    )

    socketRef.current = socket

    return () => {
      socket.disconnect()
    }
  }, [notification])

  useEffect(() => {
    if (isLoading) return
    if (hasRequestedInitialAnalysis) return
    if (messages.length > 0) return

    const ensureJob = async () => {
      try {
        await apiClient.post('/onboarding/ensure-initial-evaluation')
        setHasRequestedInitialAnalysis(true)
      } catch (error) {
        console.error('Failed to ensure initial evaluation:', error)
      }
    }

    ensureJob()
  }, [isLoading, messages.length, hasRequestedInitialAnalysis])

  const handleCancel = () => {
    if (socketRef.current && isSubmitting) {
      socketRef.current.emit('client:cancel')
    }
  }

  const handleSubmit = async () => {
    if (!inputValue.trim()) return

    setIsSubmitting(true)
    setLoadingStatus('Réflexion en cours...')

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
      await apiClient.post('/onboarding/messages', {
        content: messageContent,
      })
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      notification.error({
        message: 'Erreur',
        description: err.response?.data?.message || 'Une erreur est survenue',
      })
      setIsSubmitting(false)
    }
  }

  const getScoreBadgeClass = (scoreValue: number) => {
    if (scoreValue >= 80)
      return 'border-[var(--color-primary)] text-[var(--color-primary)]'
    return 'border-[var(--color-warning)] text-[var(--color-text-primary)]'
  }

  const toggleSection = (sectionId: string, expanded: boolean) => {
    setExpandedSections(previous => {
      if (expanded) {
        return previous.includes(sectionId)
          ? previous
          : [...previous, sectionId]
      }

      return previous.filter(id => id !== sectionId)
    })
  }

  const toggleAllSections = () => {
    setExpandedSections(
      allSectionsExpanded ? [] : parsedSections.map(section => section.id)
    )
  }

  const renderSummaryView = () => (
    <div className='w-full space-y-4 px-4 py-5 sm:px-6 sm:py-6'>
      <div className='flex flex-wrap gap-3'>
        <Button onClick={toggleAllSections}>
          {allSectionsExpanded ? 'Tout plier' : 'Tout déplier'}
        </Button>
        <Button icon={<EditOutlined />} onClick={() => setViewMode('chat')}>
          Modifier
        </Button>
      </div>

      {parsedSections.length > 0 ? (
        <div className='merge-border-radius grid gap-2'>
          {parsedSections.map(section => (
            <CollapsibleCard
              key={section.id}
              title={section.title}
              subtitle={section.summary}
              expanded={expandedSections.includes(section.id)}
              hideSubtitleWhenExpanded
              onToggle={expanded => toggleSection(section.id, expanded)}
            >
              <div className='space-y-4'>
                {section.blocks.map((block, blockIndex) =>
                  block.type === 'list' ? (
                    <ul
                      key={`${section.id}-list-${blockIndex}`}
                      className='m-0 space-y-2 text-sm leading-[1.75] text-[var(--color-text-secondary)]'
                    >
                      {block.items.map(item => (
                        <li key={item}>{renderInlineMarkdown(item)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p
                      key={`${section.id}-paragraph-${blockIndex}`}
                      className='m-0 whitespace-pre-line text-sm leading-[1.75] text-[var(--color-text-secondary)]'
                    >
                      {renderInlineMarkdown(block.text)}
                    </p>
                  )
                )}
              </div>
            </CollapsibleCard>
          ))}
        </div>
      ) : (
        <div className='rounded-[var(--radius-card)] bg-white p-5 text-sm text-[var(--color-text-secondary)] shadow-card'>
          Le contexte généré par l&apos;IA est encore vide.
        </div>
      )}
    </div>
  )

  const renderChatView = () => (
    <div className='flex h-[calc(100vh-80px)] w-full flex-col'>
      <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
        <div className='flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6'>
          {isLoading ? (
            <div className='space-y-4'>
              <Skeleton active avatar paragraph={{ rows: 2 }} />
              <Skeleton active avatar paragraph={{ rows: 2 }} />
            </div>
          ) : messages.length === 0 ? (
            <div className='py-12 text-center text-gray-500'>
              <Spin size='large' />
              <p className='mt-4'>
                En attente de l&apos;analyse initiale de l&apos;IA...
              </p>
            </div>
          ) : (
            messages.map(message => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === 'user' ? 'flex-row-reverse' : ''
                }`}
              >
                <div
                  className={`max-w-[88%] rounded-[var(--radius-card)] px-4 py-3 text-sm leading-[1.75] shadow-card ${
                    message.role === 'user'
                      ? 'border-none bg-[var(--color-primary)] text-[var(--color-text-primary)]'
                      : 'border-none bg-white text-[var(--color-text-primary)]'
                  }`}
                >
                  <p className='m-0 whitespace-pre-wrap'>{message.content}</p>
                </div>
              </div>
            ))
          )}

          {isSubmitting ? (
            <div className='flex gap-3'>
              <div className='max-w-[88%] rounded-[var(--radius-card)] border-none bg-white px-4 py-3 shadow-card'>
                <div className='flex items-center gap-3'>
                  <Spin size='small' />
                  <span className='text-sm text-[var(--color-text-secondary)]'>
                    {loadingStatus}
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          <div
            ref={node => {
              messagesEndRef.current = node
            }}
          />
        </div>

        {!isLoading ? (
          <div className='rounded-b-2xl bg-[var(--color-surface-footer)] px-4 pb-4 pt-2 sm:px-6 sm:pb-6 sm:pt-3'>
            <div className='flex items-start gap-3'>
              <Input.TextArea
                value={inputValue}
                onChange={event => setInputValue(event.target.value)}
                onPressEnter={event => {
                  if (!event.shiftKey) {
                    event.preventDefault()
                    handleSubmit()
                  }
                }}
                placeholder='Écrivez votre réponse... (Entrée pour envoyer, Shift+Entrée pour nouvelle ligne)'
                variant='borderless'
                className='flex-1 !bg-transparent text-sm'
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
                  className='!h-[46px] !w-[46px] !min-h-[46px] shrink-0 !border-none !p-0'
                />
              ) : (
                <Button
                  type='primary'
                  shape='circle'
                  size='large'
                  icon={<ArrowUpOutlined />}
                  onClick={handleSubmit}
                  disabled={!inputValue.trim()}
                  className='!h-[46px] !w-[46px] !min-h-[46px] shrink-0 !p-0'
                />
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )

  return (
    <>
      <DashboardHeader
        right={
          <div
            className={`flex items-center justify-center rounded-full border px-4 py-2 ${getScoreBadgeClass(score)}`}
          >
            <span className='text-sm font-semibold tracking-wide'>
              Score • {score}%
            </span>
          </div>
        }
        title={"Contexte de l'IA"}
      />

      {viewMode === 'summary' ? renderSummaryView() : renderChatView()}

      <Modal
        open={showActivationModal}
        onCancel={() => setShowActivationModal(false)}
        footer={
          <div className='flex justify-center'>
            <Button onClick={() => setShowActivationModal(false)}>
              Continuer à améliorer le contexte
            </Button>
          </div>
        }
        centered
        width={800}
        title={
          <div className='space-y-2'>
            <h2 className='m-0 text-[var(--font-size-title-sm)] font-semibold text-[var(--color-text-primary)]'>
              Votre IA est prête !
            </h2>
            <Text
              type='secondary'
              className='m-0 text-base text-[var(--color-text-secondary)] !font-normal'
            >
              Vous pouvez maintenant activer votre agent ou continuer à fournir
              des informations pour le rendre plus précis.
            </Text>
          </div>
        }
      >
        <div className='flex flex-col gap-2 py-6 md:flex-row'>
          <div className='flex-1'>
            <AgentTestCard />
          </div>
          <div className='flex-1'>
            <AgentProductionCard />
          </div>
        </div>
      </Modal>
    </>
  )
}
