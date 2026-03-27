import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from '@tanstack/react-router'
import AntdApp from 'antd/es/app'
import ConfigProvider from 'antd/es/config-provider'
import frFR from 'antd/es/locale/fr_FR'
import dayjs from 'dayjs'
import 'dayjs/locale/fr'
import { useEffect, useRef, type ReactNode } from 'react'

import type { QueryClient } from '@tanstack/react-query'

import { AuthProvider } from '@app/contexts/AuthContext'
import { antdProviderProps } from '@app/core/theme'
import {
  getAnalyticsPageLocation,
  getAnalyticsPagePath,
  initGoogleAnalytics,
  trackPageView,
  trackSiteOpen,
} from '@app/lib/analytics/google-analytics'
import TanStackQueryProvider from '../integrations/tanstack-query/root-provider'
import legacyAppCss from '../app/app.css?url'

dayjs.locale('fr')

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'WhatsApp Agent' },
      {
        name: 'description',
        content:
          'WhatsApp Agent frontend migrate vers TanStack Start, React 19 et Cloudflare.',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: legacyAppCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        <TanStackQueryProvider>
          <ConfigProvider {...antdProviderProps} locale={frFR}>
            <AntdApp>
              <AuthProvider>
                <GoogleAnalyticsTracker />
                {children}
              </AuthProvider>
            </AntdApp>
          </ConfigProvider>
        </TanStackQueryProvider>
        <Scripts />
      </body>
    </html>
  )
}

function GoogleAnalyticsTracker() {
  const location = useRouterState({
    select: (state) => state.location,
  })
  const previousLocationRef = useRef<string | null>(
    typeof document !== 'undefined' && document.referrer
      ? document.referrer
      : null
  )

  useEffect(() => {
    initGoogleAnalytics()
  }, [])

  useEffect(() => {
    const analyticsLocation = {
      hash: location.hash,
      pathname: location.pathname,
      search: location.searchStr,
    }
    const pageLocation = getAnalyticsPageLocation(analyticsLocation)
    const pagePath = getAnalyticsPagePath(analyticsLocation)

    trackPageView(analyticsLocation, {
      pageReferrer: previousLocationRef.current,
    })
    trackSiteOpen(pagePath)

    previousLocationRef.current = pageLocation
  }, [location.hash, location.pathname, location.searchStr])

  return null
}
