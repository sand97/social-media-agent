import * as Sentry from '@sentry/tanstackstart-react'

const sentryDsn = import.meta.env?.VITE_SENTRY_DSN ?? process.env.VITE_SENTRY_DSN
const sentryEnvironment =
  (import.meta.env?.DEV || process.env.NODE_ENV !== 'production')
    ? 'development'
    : 'production'
const sentryRelease = 'whatsapp-agent-frontend'
const sentryTracesSampleRate = 0.2
const sentryReplaysSessionSampleRate = 0
const sentryReplaysOnErrorSampleRate = 1

if (!sentryDsn) {
  console.warn('VITE_SENTRY_DSN is not defined. Sentry is not running.')
} else {
  Sentry.init({
    dsn: sentryDsn,
    environment: sentryEnvironment || undefined,
    release: sentryRelease || undefined,
    // Adds request headers and IP for users, for more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/configuration/options/#sendDefaultPii
    sendDefaultPii: true,
    tracesSampleRate: sentryTracesSampleRate,
    replaysSessionSampleRate: sentryReplaysSessionSampleRate,
    replaysOnErrorSampleRate: sentryReplaysOnErrorSampleRate,
  })
}
