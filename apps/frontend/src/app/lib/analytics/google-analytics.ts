const DEFAULT_GA_MEASUREMENT_ID = 'G-F4HJD44WXN'
const TRANSIENT_QUERY_PARAMS = new Set([
  'payment',
  'provider',
  'reason',
  'reference',
])
const TRACKED_ONCE_STORAGE_PREFIX = 'whatsapp-agent-ga-once:'

type AnalyticsPrimitive = boolean | number | string

export type AnalyticsItem = {
  item_category?: string
  item_id?: string
  item_name?: string
  item_variant?: string
  price?: number
  quantity?: number
}

type AnalyticsFieldValue =
  | AnalyticsPrimitive
  | AnalyticsItem[]
  | AnalyticsPrimitive[]
  | (() => void)
  | null
  | undefined

export type AnalyticsEventParams = Record<string, AnalyticsFieldValue>

type PageLocationLike = {
  hash?: string
  pathname: string
  search?: string
}

type SignUpFlow = 'otp' | 'pairing' | 'qr'

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

const gaMeasurementId =
  import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() || DEFAULT_GA_MEASUREMENT_ID

let hasConfiguredGoogleAnalytics = false
let lastTrackedPageLocation: string | null = null

function canUseBrowser() {
  return typeof document !== 'undefined' && typeof window !== 'undefined'
}

function getPagePath({ hash = '', pathname, search = '' }: PageLocationLike) {
  const params = new URLSearchParams(search)

  for (const param of TRANSIENT_QUERY_PARAMS) {
    params.delete(param)
  }

  const nextSearch = params.toString()

  return `${pathname}${nextSearch ? `?${nextSearch}` : ''}${hash}`
}

function getPageLocation(location: PageLocationLike) {
  if (!canUseBrowser()) {
    return getPagePath(location)
  }

  return new URL(getPagePath(location), window.location.origin).toString()
}

function filterEventParams(
  params?: AnalyticsEventParams
): AnalyticsEventParams | undefined {
  if (!params) {
    return undefined
  }

  const filteredEntries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null
  )

  if (filteredEntries.length === 0) {
    return undefined
  }

  return Object.fromEntries(filteredEntries)
}

function ensureGtagFunction() {
  if (!canUseBrowser()) {
    return null
  }

  const dataLayer = (window.dataLayer ??= [])

  if (!window.gtag) {
    window.gtag = function gtag(..._args: unknown[]) {
      dataLayer.push(arguments)
    }
  }

  return window.gtag
}

function appendGoogleAnalyticsScript(measurementId: string) {
  if (!canUseBrowser()) {
    return
  }

  const selector = `script[data-ga-measurement-id="${measurementId}"]`
  if (document.querySelector(selector)) {
    return
  }

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
  script.dataset.gaMeasurementId = measurementId
  document.head.appendChild(script)
}

function shouldTrackOnce(key: string) {
  if (!canUseBrowser()) {
    return false
  }

  const storageKey = `${TRACKED_ONCE_STORAGE_PREFIX}${key}`

  try {
    if (window.sessionStorage.getItem(storageKey) === '1') {
      return false
    }

    window.sessionStorage.setItem(storageKey, '1')
    return true
  } catch {
    return true
  }
}

export function initGoogleAnalytics() {
  if (!gaMeasurementId || !canUseBrowser() || hasConfiguredGoogleAnalytics) {
    return
  }

  appendGoogleAnalyticsScript(gaMeasurementId)

  const gtag = ensureGtagFunction()
  if (!gtag) {
    return
  }

  gtag('js', new Date())
  gtag('config', gaMeasurementId, {
    send_page_view: false,
  })

  hasConfiguredGoogleAnalytics = true
}

export function trackEvent(name: string, params?: AnalyticsEventParams) {
  if (!gaMeasurementId || !canUseBrowser()) {
    return
  }

  initGoogleAnalytics()

  const gtag = ensureGtagFunction()
  if (!gtag) {
    return
  }

  const filteredParams = filterEventParams(params)

  if (filteredParams) {
    gtag('event', name, filteredParams)
    return
  }

  gtag('event', name)
}

export function trackEventOnce(
  key: string,
  name: string,
  params?: AnalyticsEventParams
) {
  if (!shouldTrackOnce(key)) {
    return
  }

  trackEvent(name, params)
}

export function trackPageView(
  location: PageLocationLike,
  options?: {
    pageReferrer?: string | null
    pageTitle?: string
  }
) {
  const pageLocation = getPageLocation(location)

  if (lastTrackedPageLocation === pageLocation) {
    return
  }

  lastTrackedPageLocation = pageLocation

  trackEvent('page_view', {
    page_location: pageLocation,
    page_path: getPagePath(location),
    page_referrer: options?.pageReferrer || undefined,
    page_title: options?.pageTitle || (canUseBrowser() ? document.title : ''),
  })
}

export function trackSiteOpen(entryPath: string) {
  trackEventOnce('site_open', 'site_open', {
    entry_path: entryPath,
  })
}

export function trackFirstLoginSignUp(input: {
  authFlow: SignUpFlow
  isFirstLogin?: boolean
  userId?: string | null
}) {
  if (!input.isFirstLogin || !input.userId) {
    return
  }

  trackEventOnce(`sign_up:${input.userId}`, 'sign_up', {
    auth_flow: input.authFlow,
    method: 'whatsapp_pairing',
  })
}

export function getAnalyticsPagePath(location: PageLocationLike) {
  return getPagePath(location)
}

export function getAnalyticsPageLocation(location: PageLocationLike) {
  return getPageLocation(location)
}
