const DEFAULT_GA_MEASUREMENT_ID = 'G-F4HJD44WXN'
const TRACKED_ONCE_STORAGE_PREFIX = 'whatsapp-agent-ga-once:'
const TRANSIENT_QUERY_PARAMS = new Set([
  'payment',
  'provider',
  'reason',
  'reference',
])

type AnalyticsPrimitive = boolean | number | string
type AnalyticsParams = Record<string, AnalyticsPrimitive | null | undefined>
type PageLocationLike = {
  hash?: string
  pathname: string
  search?: string
}

declare global {
  interface Window {
    dataLayer: unknown[]
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

function ensureGtagFunction() {
  if (!canUseBrowser()) {
    return null
  }

  window.dataLayer = window.dataLayer || []

  if (!window.gtag) {
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer.push(args)
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

function filterEventParams(params?: AnalyticsParams) {
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

export function trackEvent(name: string, params?: AnalyticsParams) {
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
  if (!shouldTrackOnce('site_open')) {
    return
  }

  trackEvent('site_open', {
    entry_path: entryPath,
  })
}
