import {
  PairingCodeReadyScreen,
  ProvisioningTimelineScreen,
  QrRetrievalScreen,
  type ProvisioningPayload,
} from '@app/components/auth-provisioning/ProvisioningScreens'
import { Button, Segmented, Slider } from 'antd'
import { useMemo, useState } from 'react'

type DebugMode =
  | 'timeline-server'
  | 'timeline-install'
  | 'timeline-start'
  | 'qr-loading'
  | 'qr-ready'
  | 'pairing-ready'

const QR_DEBUG_VALUE =
  'https://wa.me/237612345678?debug_qr=bedones_whatsapp_stack_ready'

export default function AuthProvisioningDebugPage() {
  const [mode, setMode] = useState<DebugMode>('timeline-server')
  const [progress, setProgress] = useState(32)

  const timelinePayload = useMemo<ProvisioningPayload>(() => {
    if (mode === 'timeline-install') {
      return {
        completedJobs: 1,
        progress,
        stage: 'STACK_INSTALLING',
        subtitle:
          "L'instance existe. Nous installons maintenant l'agent, le connector, Redis et Qdrant.",
        title: "Installation de l'IA",
      }
    }

    if (mode === 'timeline-start') {
      return {
        completedJobs: 2,
        progress,
        stage: 'STACK_STARTING',
        subtitle:
          'Les conteneurs sont là. Nous attendons que les healthchecks passent.',
        title: "Lancement de l'IA",
      }
    }

    return {
      completedJobs: 0,
      progress,
      stage: 'SERVER_INITIALIZING',
      subtitle:
        'Cas le plus lent: achat du VPS, rattachement réseau puis bootstrap initial.',
      title: 'Initialisation du serveur',
    }
  }, [mode, progress])

  const content = (() => {
    if (mode === 'qr-loading') {
      return <QrRetrievalScreen subtitle='État dédié de récupération du QR sans stepper.' />
    }

    if (mode === 'qr-ready') {
      return <QrRetrievalScreen qrCode={QR_DEBUG_VALUE} />
    }

    if (mode === 'pairing-ready') {
      return (
        <PairingCodeReadyScreen
          code='12345678'
          phoneNumber='+237 612 34 56 78'
        />
      )
    }

    return <ProvisioningTimelineScreen payload={timelinePayload} />
  })()

  return (
    <div className='relative'>
      {content}

      <div className='fixed right-4 top-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-4 rounded-[28px] border border-[rgba(17,27,33,0.12)] bg-[rgba(255,255,255,0.94)] p-4 shadow-[0_24px_60px_rgba(17,27,33,0.12)] backdrop-blur-md'>
        <div>
          <p className='m-0 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]'>
            Debug local
          </p>
          <p className='m-0 mt-2 text-lg font-semibold text-[var(--color-text-primary)]'>
            États du flow de connexion
          </p>
        </div>

        <Segmented
          block
          options={[
            { label: 'Serveur', value: 'timeline-server' },
            { label: 'Install', value: 'timeline-install' },
            { label: 'Start', value: 'timeline-start' },
            { label: 'QR loading', value: 'qr-loading' },
            { label: 'QR prêt', value: 'qr-ready' },
            { label: 'Pairing', value: 'pairing-ready' },
          ]}
          value={mode}
          onChange={value => setMode(value as DebugMode)}
        />

        {mode.startsWith('timeline') ? (
          <div>
            <p className='mb-2 text-sm font-medium text-[var(--color-text-primary)]'>
              Progression
            </p>
            <Slider min={4} max={100} value={progress} onChange={setProgress} />
          </div>
        ) : null}

        <Button href='/auth/login' type='primary'>
          Retour au login
        </Button>
      </div>
    </div>
  )
}
