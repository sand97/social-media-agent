import {
  CheckCircleFilled,
  DeploymentUnitOutlined,
  LoadingOutlined,
  MobileOutlined,
  QrcodeOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import { Button, Progress, Spin } from 'antd'
import { QRCodeSVG } from 'qrcode.react'
import { type ReactNode } from 'react'

export type ProvisioningStage =
  | 'SERVER_INITIALIZING'
  | 'STACK_INSTALLING'
  | 'STACK_STARTING'
  | 'QR_FETCHING'

export type ProvisioningPayload = {
  completedJobs?: number
  progress?: number
  stage?: ProvisioningStage | string
  status?: string
  subtitle?: string
  title?: string
  workflowId?: string
}

type StepDefinition = {
  description: string
  icon: ReactNode
  key: ProvisioningStage
  title: string
}

const STEP_DEFINITIONS: StepDefinition[] = [
  {
    description:
      "Nous démarrons un nouveau serveur pour accueillir l'agent qui répondra à vos messages.",
    icon: <DeploymentUnitOutlined />,
    key: 'SERVER_INITIALIZING',
    title: 'Initialisation du serveur',
  },
  {
    description:
      "Nous installons Bedones WhatsApp, l'agent IA et toutes les briques techniques sur votre stack.",
    icon: <RocketOutlined />,
    key: 'STACK_INSTALLING',
    title: "Installation de l'IA",
  },
  {
    description:
      'Nous attendons que les services démarrent, deviennent sains et puissent recevoir votre session.',
    icon: <LoadingOutlined />,
    key: 'STACK_STARTING',
    title: "Lancement de l'IA",
  },
]

function getStepState(activeStage: string | undefined, stepKey: ProvisioningStage) {
  const activeIndex = STEP_DEFINITIONS.findIndex(step => step.key === activeStage)
  const stepIndex = STEP_DEFINITIONS.findIndex(step => step.key === stepKey)

  if (activeStage === 'QR_FETCHING' || activeIndex > stepIndex) {
    return 'done'
  }

  if (activeIndex === stepIndex) {
    return 'active'
  }

  if (activeIndex === -1 && stepIndex === 0) {
    return 'active'
  }

  return 'pending'
}

function Shell({
  actions,
  children,
  eyebrow,
  subtitle,
  title,
}: {
  actions?: ReactNode
  children: ReactNode
  eyebrow: string
  subtitle: string
  title: string
}) {
  return (
    <div className='min-h-screen bg-[radial-gradient(circle_at_top,_rgba(36,211,102,0.14),_transparent_38%),linear-gradient(180deg,#fbfaf6_0%,#f0eee6_100%)] px-4 py-8'>
      <div className='mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-6xl items-center justify-center'>
        <div className='grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]'>
          <div className='relative overflow-hidden rounded-[34px] border border-[rgba(17,27,33,0.12)] bg-[rgba(255,255,255,0.84)] p-6 shadow-[0_24px_60px_rgba(17,27,33,0.08)] sm:p-10'>
            <div className='absolute inset-0 bg-[linear-gradient(135deg,rgba(17,27,33,0.04),transparent_55%,rgba(36,211,102,0.08))]' />
            <div className='relative z-10'>
              <span className='inline-flex rounded-full border border-[rgba(17,27,33,0.12)] bg-[rgba(255,255,255,0.88)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]'>
                {eyebrow}
              </span>
              <h1 className='mt-5 max-w-[12ch] text-[clamp(2.3rem,5vw,4.5rem)] font-semibold leading-[0.94] text-[var(--color-text-primary)]'>
                {title}
              </h1>
              <p className='mt-4 max-w-xl text-base leading-7 text-[var(--color-text-secondary)] sm:text-lg'>
                {subtitle}
              </p>
              <div className='mt-10'>{children}</div>
              {actions ? <div className='mt-8'>{actions}</div> : null}
            </div>
          </div>

          <div className='rounded-[34px] border border-[rgba(17,27,33,0.1)] bg-[#111b21] p-6 text-white shadow-[0_24px_60px_rgba(17,27,33,0.14)] sm:p-8'>
            <div className='flex h-full flex-col justify-between gap-8'>
              <div>
                <p className='text-xs font-semibold uppercase tracking-[0.18em] text-white/55'>
                  Ce que voit votre client
                </p>
                <p className='mt-4 text-2xl font-semibold leading-tight'>
                  Une attente guidée, précise et jamais vide.
                </p>
                <p className='mt-4 text-sm leading-7 text-white/72'>
                  Chaque étape est visible en temps réel. Dès que la stack
                  arrive, on bascule vers le QR code ou le code de pairing sans
                  redemander d’action inutile.
                </p>
              </div>
              <div className='grid gap-3 rounded-[28px] bg-white/6 p-4 backdrop-blur-sm'>
                <div className='rounded-[22px] border border-white/10 bg-white/6 p-4'>
                  <div className='flex items-center gap-3'>
                    <span className='flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[var(--color-text-primary)]'>
                      <QrcodeOutlined />
                    </span>
                    <div>
                      <p className='m-0 text-sm font-semibold text-white'>
                        QR dédié
                      </p>
                      <p className='m-0 text-sm text-white/65'>
                        Pas de stepper quand on récupère les identifiants.
                      </p>
                    </div>
                  </div>
                </div>
                <div className='rounded-[22px] border border-white/10 bg-white/6 p-4'>
                  <div className='flex items-center gap-3'>
                    <span className='flex h-11 w-11 items-center justify-center rounded-2xl bg-[#24d366] text-[var(--color-text-primary)]'>
                      <MobileOutlined />
                    </span>
                    <div>
                      <p className='m-0 text-sm font-semibold text-white'>
                        Session mobile
                      </p>
                      <p className='m-0 text-sm text-white/65'>
                        Le code de pairing arrive dès que le connector est prêt.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ProvisioningTimelineScreen({
  errorMessage,
  onBack,
  payload,
}: {
  errorMessage?: string | null
  onBack?: () => void
  payload?: ProvisioningPayload
}) {
  const progress = Math.max(0, Math.min(payload?.progress ?? 6, 100))
  const activeStage = payload?.stage

  return (
    <Shell
      eyebrow='Provisioning'
      subtitle={
        payload?.subtitle ||
        "Nous préparons votre stack Bedones WhatsApp. Vous recevrez la connexion dès que le serveur et les services seront prêts."
      }
      title={payload?.title || 'Préparation en cours'}
      actions={
        onBack ? (
          <Button type='default' size='large' onClick={onBack}>
            Retour
          </Button>
        ) : null
      }
    >
      <div className='rounded-[30px] border border-[rgba(17,27,33,0.08)] bg-white/92 p-6 shadow-[0_18px_40px_rgba(17,27,33,0.06)]'>
        <div className='flex flex-wrap items-center justify-between gap-4'>
          <div>
            <p className='m-0 text-sm font-medium text-[var(--color-text-secondary)]'>
              Progression de la mise en route
            </p>
            <p className='m-0 mt-1 text-3xl font-semibold text-[var(--color-text-primary)]'>
              {progress}%
            </p>
          </div>
          <div className='min-w-[220px] flex-1'>
            <Progress
              percent={progress}
              showInfo={false}
              strokeColor='#24d366'
              trailColor='#eceae4'
              strokeLinecap='butt'
            />
            <p className='mt-2 text-sm text-[var(--color-text-secondary)]'>
              {payload?.completedJobs ?? 0} job(s) GitHub terminé(s)
            </p>
          </div>
        </div>

        <div className='mt-8 grid gap-4'>
          {STEP_DEFINITIONS.map(step => {
            const state = getStepState(activeStage, step.key)
            const isDone = state === 'done'
            const isActive = state === 'active'

            return (
              <div
                key={step.key}
                className={`rounded-[24px] border p-5 transition ${
                  isActive
                    ? 'border-[rgba(17,27,33,0.2)] bg-[rgba(36,211,102,0.08)] shadow-[0_18px_34px_rgba(17,27,33,0.05)]'
                    : isDone
                      ? 'border-[rgba(36,211,102,0.22)] bg-white'
                      : 'border-[rgba(17,27,33,0.08)] bg-[rgba(255,255,255,0.84)]'
                }`}
              >
                <div className='flex items-start gap-4'>
                  <span
                    className={`mt-1 flex h-12 w-12 items-center justify-center rounded-2xl text-lg ${
                      isDone
                        ? 'bg-[#24d366] text-[var(--color-text-primary)]'
                        : isActive
                          ? 'bg-[var(--color-text-primary)] text-white'
                          : 'bg-[var(--color-surface-accent)] text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {isDone ? <CheckCircleFilled /> : step.icon}
                  </span>
                  <div className='min-w-0'>
                    <div className='flex items-center gap-3'>
                      <p className='m-0 text-lg font-semibold text-[var(--color-text-primary)]'>
                        {step.title}
                      </p>
                      {isActive ? <Spin size='small' /> : null}
                    </div>
                    <p className='m-0 mt-2 text-sm leading-7 text-[var(--color-text-secondary)]'>
                      {step.description}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {errorMessage ? (
          <div className='mt-6 rounded-[22px] border border-[rgba(255,107,74,0.2)] bg-[rgba(255,107,74,0.08)] px-4 py-3 text-sm leading-7 text-[var(--color-text-primary)]'>
            {errorMessage}
          </div>
        ) : null}
      </div>
    </Shell>
  )
}

export function QrRetrievalScreen({
  onBack,
  qrCode,
  subtitle,
}: {
  onBack?: () => void
  qrCode?: string | null
  subtitle?: string
}) {
  const isLoading = !qrCode

  return (
    <Shell
      eyebrow='Connexion WhatsApp'
      subtitle={
        subtitle ||
        "Votre stack est prête. Nous récupérons maintenant les informations de connexion WhatsApp sur l'instance qui vous a été réservée."
      }
      title={isLoading ? 'Récupération du code QR' : 'Scannez le code QR'}
      actions={
        onBack ? (
          <Button type='default' size='large' onClick={onBack}>
            Retour
          </Button>
        ) : null
      }
    >
      <div className='flex flex-col items-center justify-center rounded-[30px] border border-[rgba(17,27,33,0.08)] bg-white/94 px-6 py-10 text-center shadow-[0_20px_42px_rgba(17,27,33,0.06)]'>
        <div className='mb-6 flex h-[72px] w-[72px] items-center justify-center rounded-[26px] bg-[var(--color-surface-accent)] text-4xl text-[var(--color-text-primary)]'>
          <QrcodeOutlined />
        </div>

        {isLoading ? (
          <>
            <div className='mb-6 rounded-full border border-[rgba(17,27,33,0.08)] bg-[rgba(17,27,33,0.04)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)]'>
              Connexion en cours
            </div>
            <Spin size='large' />
            <p className='mt-6 max-w-lg text-sm leading-7 text-[var(--color-text-secondary)]'>
              Nous interrogeons votre connector pour récupérer les informations
              de connexion. Cet écran est normalement celui que verront la
              plupart des utilisateurs.
            </p>
          </>
        ) : (
          <>
            <div className='rounded-[30px] border border-[rgba(17,27,33,0.08)] bg-white p-6 shadow-[0_12px_32px_rgba(17,27,33,0.07)]'>
              <QRCodeSVG value={qrCode} size={264} level='M' />
            </div>
            <p className='mt-6 max-w-lg text-sm leading-7 text-[var(--color-text-secondary)]'>
              Ouvrez WhatsApp Business, allez dans les appareils connectés puis
              scannez ce QR code pour finaliser la connexion.
            </p>
          </>
        )}
      </div>
    </Shell>
  )
}

export function PairingCodeReadyScreen({
  code,
  onContinue,
  phoneNumber,
}: {
  code: string
  onContinue?: () => void
  phoneNumber?: string
}) {
  const formattedCode = code.match(/.{1,4}/g)?.join(' ') || code

  return (
    <Shell
      eyebrow='Connexion mobile'
      subtitle="Votre stack est prête. Le connector a généré le code de pairing correspondant à votre numéro."
      title='Code de pairing prêt'
      actions={
        onContinue ? (
          <Button type='primary' size='large' onClick={onContinue}>
            Continuer
          </Button>
        ) : null
      }
    >
      <div className='rounded-[30px] border border-[rgba(17,27,33,0.08)] bg-white/94 p-8 shadow-[0_20px_42px_rgba(17,27,33,0.06)]'>
        <div className='flex items-start gap-4'>
          <span className='flex h-14 w-14 items-center justify-center rounded-[22px] bg-[#24d366] text-2xl text-[var(--color-text-primary)]'>
            <MobileOutlined />
          </span>
          <div className='min-w-0'>
            <p className='m-0 text-lg font-semibold text-[var(--color-text-primary)]'>
              Associez votre appareil
            </p>
            <p className='m-0 mt-2 text-sm leading-7 text-[var(--color-text-secondary)]'>
              {phoneNumber
                ? `Entrez ce code dans WhatsApp pour ${phoneNumber}.`
                : 'Entrez ce code dans WhatsApp pour continuer.'}
            </p>
          </div>
        </div>

        <div className='mt-8 rounded-[26px] border border-[rgba(17,27,33,0.08)] bg-[var(--color-surface-muted)] px-6 py-8 text-center'>
          <p className='m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]'>
            Code de pairing
          </p>
          <p className='m-0 mt-3 text-[clamp(2.1rem,8vw,4.4rem)] font-semibold tracking-[0.2em] text-[var(--color-text-primary)]'>
            {formattedCode}
          </p>
        </div>
      </div>
    </Shell>
  )
}
