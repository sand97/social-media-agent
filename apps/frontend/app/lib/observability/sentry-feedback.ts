import apiClient from '@app/lib/api/client'

type SentryDsn = {
  host: string
  path: string
  projectId: string
  protocol: string
  publicKey: string
}

export interface SupportFeedbackContext {
  appArea?: string
  currentPlan?: string
  route?: string
  timezone?: string
  url?: string
  userId?: string
  contextScore?: string
}

export interface SendSupportFeedbackParams {
  category: string
  email: string
  message: string
  name: string
  subject?: string
  context?: SupportFeedbackContext
}

function parseDsn(rawDsn: string): SentryDsn | null {
  try {
    const url = new URL(rawDsn)
    const pathname = url.pathname.replace(/^\/+/, '')
    const pathSegments = pathname.split('/').filter(Boolean)
    const projectId = pathSegments.pop()

    if (!projectId || !url.username) {
      return null
    }

    return {
      host: url.host,
      path: pathSegments.join('/'),
      projectId,
      protocol: url.protocol,
      publicKey: url.username,
    }
  } catch {
    return null
  }
}

export function getSentryFeedbackConfig() {
  const rawDsn = import.meta.env.VITE_SENTRY_DSN?.trim()

  if (!rawDsn) {
    return {
      enabled: false as const,
      reason: 'missing_dsn' as const,
    }
  }

  const parsed = parseDsn(rawDsn)

  if (!parsed) {
    return {
      enabled: false as const,
      reason: 'invalid_dsn' as const,
    }
  }

  return {
    enabled: true as const,
    dsn: rawDsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT?.trim(),
    release: import.meta.env.VITE_SENTRY_RELEASE?.trim(),
  }
}

export async function sendSupportFeedback({
  category,
  email,
  message,
  name,
  subject,
  context,
}: SendSupportFeedbackParams) {
  const config = getSentryFeedbackConfig()

  if (!config.enabled) {
    throw new Error(
      "La configuration Sentry frontend est absente. Renseignez VITE_SENTRY_DSN pour activer l'envoi."
    )
  }

  const response = await apiClient.post<{ eventId: string }>(
    '/users/me/support-feedback',
    {
      category,
      context,
      email,
      message,
      name,
      sentry: {
        dsn: config.dsn,
        environment: config.environment,
        release: config.release,
      },
      subject,
    }
  )

  return response.data.eventId
}
