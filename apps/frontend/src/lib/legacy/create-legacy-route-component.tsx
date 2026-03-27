import AuthLayout from '@app/layout/auth-layout'
import DashboardLayout from '@app/layout/dashboard-layout'
import { useNavigate as useTanStackNavigate } from '@tanstack/react-router'
import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { useEffect } from 'react'

type LegacyLayout = 'auth' | 'dashboard' | 'none'

type LegacyModule = {
  default: ComponentType
}

export type PreloadableLegacyRouteComponent = (() => JSX.Element) & {
  preload: () => Promise<void>
}

export function createLegacyRouteComponent(
  loader: () => Promise<LegacyModule>,
  fallback: ReactNode,
  layout: LegacyLayout = 'none'
) {
  let pendingModule: Promise<LegacyModule> | undefined

  const loadModule = () => {
    if (!pendingModule) {
      pendingModule = loader()
    }

    return pendingModule
  }

  const preload = () => loadModule().then(() => undefined)

  const Component = lazy(loadModule)

  function LegacyRouteComponent() {
    const suspenseContent = (
      <Suspense fallback={fallback}>
        <Component />
      </Suspense>
    )

    let wrappedContent = suspenseContent

    if (layout === 'auth') {
      wrappedContent = <AuthLayout>{suspenseContent}</AuthLayout>
    } else if (layout === 'dashboard') {
      wrappedContent = <DashboardLayout>{suspenseContent}</DashboardLayout>
    }

    return wrappedContent
  }

  const preloadableComponent = Object.assign(LegacyRouteComponent, {
    preload,
  }) as unknown as PreloadableLegacyRouteComponent

  return preloadableComponent
}

export function LegacyRedirect({
  replace = true,
  to,
}: {
  replace?: boolean
  to: string
}) {
  const navigate = useTanStackNavigate()

  useEffect(() => {
    void navigate({ replace, to } as never)
  }, [navigate, replace, to])

  return null
}
