import {
  CustomerServiceOutlined,
  LoadingOutlined,
  LogoutOutlined,
  QuestionCircleOutlined,
  UserOutlined,
} from '@ant-design/icons'
import CatalogIcon from '@app/assets/CatalogIcon.svg?react'
import HomeIcon from '@app/assets/HomeIcon.svg?react'
import LeadsIcon from '@app/assets/LeadsIcon.svg?react'
import RocketIcon from '@app/assets/Rocket.svg?react'
import StatsIcon from '@app/assets/StatsIcons.svg?react'
import StoriesIcon from '@app/assets/StoriesIcon.svg?react'
import SubscribeIcon from '@app/assets/SubscribreIcon.svg?react'
import { LayoutProvider, useLayout } from '@app/contexts/LayoutContext'
import { useAuth } from '@app/hooks/useAuth'
import { getPlanLabel, resolveCurrentPlanKey } from '@app/lib/current-plan'
import { useRouter } from '@tanstack/react-router'
import Avatar from 'antd/es/avatar'
import Layout from 'antd/es/layout'
import Menu from 'antd/es/menu'
import Modal from 'antd/es/modal'
import Spin from 'antd/es/spin'
import { Suspense, lazy, type ReactNode, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const { Sider } = Layout
const LazySupportFeedbackModal = lazy(() =>
  import('@app/components/support/SupportFeedbackModal').then(module => ({
    default: module.SupportFeedbackModal,
  }))
)

const DESKTOP_SIDER_WIDTH = 280
const DESKTOP_COLLAPSED_WIDTH = 80
const CONTEXT_OPTIONAL_KEYS = new Set([
  'context',
  'leads',
  'pricing',
  'support',
  'faq',
])
const CONTEXT_OPTIONAL_PATHS = [
  '/context',
  '/leads',
  '/pricing',
  '/support',
  '/faq',
]

const SIDEBAR_ICON_SIZE = '16px'
const legacyRoutePrefetchers: Record<string, () => Promise<unknown>> = {
  '/dashboard': () => import('@app/routes/dashboard'),
  '/stats': () => import('@app/routes/stats'),
  '/leads': () => import('@app/routes/leads'),
  '/pricing': () => import('@app/routes/pricing'),
  '/context': () => import('@app/routes/context.onboarding'),
  '/catalog': () => import('@app/routes/catalog'),
  '/status-scheduler': () => import('@app/routes/status-scheduler'),
  '/support': () => import('@app/routes/support'),
  '/faq': () => import('@app/routes/faq'),
}

const menuSections = [
  {
    title: 'Général',
    items: [
      {
        key: 'home',
        label: 'Accueil',
        icon: <HomeIcon width={SIDEBAR_ICON_SIZE} height={SIDEBAR_ICON_SIZE} />,
        path: '/dashboard',
      },
      {
        key: 'stats',
        label: 'Statistiques',
        icon: (
          <StatsIcon width={SIDEBAR_ICON_SIZE} height={SIDEBAR_ICON_SIZE} />
        ),
        path: '/stats',
      },
      {
        key: 'leads',
        label: 'Leads',
        icon: (
          <LeadsIcon width={SIDEBAR_ICON_SIZE} height={SIDEBAR_ICON_SIZE} />
        ),
        path: '/leads',
      },
      {
        key: 'subscriptions',
        label: 'Souscriptions',
        icon: (
          <SubscribeIcon width={SIDEBAR_ICON_SIZE} height={SIDEBAR_ICON_SIZE} />
        ),
        path: '/pricing',
      },
    ],
  },
  {
    title: 'Configuration',
    items: [
      {
        key: 'context',
        label: "Contexte de l'IA",
        icon: (
          <RocketIcon width={SIDEBAR_ICON_SIZE} height={SIDEBAR_ICON_SIZE} />
        ),
        path: '/context',
      },
      {
        key: 'catalog',
        label: 'Catalogue',
        icon: (
          <CatalogIcon width={SIDEBAR_ICON_SIZE} height={SIDEBAR_ICON_SIZE} />
        ),
        path: '/catalog',
      },
      {
        key: 'marketing',
        label: 'Status scheduler',
        icon: (
          <StoriesIcon width={SIDEBAR_ICON_SIZE} height={SIDEBAR_ICON_SIZE} />
        ),
        path: '/status-scheduler',
      },
    ],
  },
  {
    title: 'Aides',
    items: [
      {
        key: 'support',
        label: 'Support',
        icon: (
          <CustomerServiceOutlined style={{ fontSize: SIDEBAR_ICON_SIZE }} />
        ),
        path: '/support',
      },
      {
        key: 'faq',
        label: 'FAQ',
        icon: (
          <QuestionCircleOutlined style={{ fontSize: SIDEBAR_ICON_SIZE }} />
        ),
        path: '/faq',
      },
    ],
  },
]

type DashboardSidebarContentProps = {
  collapsed: boolean
  isDashboardHome: boolean
  isContextIncomplete: boolean
  onOpenHomeSupportModal: () => void
  selectedKeys: string[]
  onLogout: () => void
  onNavigate: (path: string) => void
  onPrefetch: (path: string) => void
  user: ReturnType<typeof useAuth>['user']
}

function DashboardSidebarContent({
  collapsed,
  isDashboardHome,
  isContextIncomplete,
  onOpenHomeSupportModal,
  selectedKeys,
  onLogout,
  onNavigate,
  onPrefetch,
  user,
}: DashboardSidebarContentProps) {
  const planLabel = user ? getPlanLabel(resolveCurrentPlanKey(user)) : 'Free'

  return (
    <div className='flex h-full flex-col'>
      <div className='brand-name'>
        {!collapsed ? (
          <div className='flex items-center gap-3'>
            <Avatar
              size={40}
              src={user?.businessInfo?.avatar_url}
              icon={!user?.businessInfo?.avatar_url && <UserOutlined />}
              className='bg-[#bfbfbf] flex-shrink-0'
            />
            <div className='flex min-w-0 flex-1 flex-col gap-1'>
              <div className='flex items-center gap-2'>
                {user?.whatsappProfile?.pushname && (
                  <span className='truncate text-sm font-medium text-black'>
                    {user?.whatsappProfile?.pushname}
                  </span>
                )}
                <span className='rounded bg-[#24d366] px-2 py-0.5 text-xs font-semibold text-black'>
                  {planLabel}
                </span>
              </div>
              <span className='truncate text-xs text-[#494949]'>
                {user?.phoneNumber}
              </span>
            </div>
          </div>
        ) : (
          <Avatar
            size={40}
            src={user?.businessInfo?.avatar_url}
            icon={!user?.businessInfo?.avatar_url && <UserOutlined />}
            className='bg-white'
          />
        )}
      </div>

      <div className='flex-1 overflow-auto py-4'>
        <Menu
          mode='inline'
          selectedKeys={selectedKeys}
          items={menuSections.map(section => ({
            type: 'group' as const,
            label:
              section.title === 'Aides' && isDashboardHome ? (
                <button
                  type='button'
                  onClick={onOpenHomeSupportModal}
                  className='w-full cursor-pointer border-none bg-transparent p-0 text-left transition-opacity hover:opacity-80'
                >
                  {section.title}
                </button>
              ) : (
                section.title
              ),
            children: section.items.map(item => ({
              key: item.key,
              icon: item.icon,
              label: item.label,
              disabled:
                isContextIncomplete && !CONTEXT_OPTIONAL_KEYS.has(item.key),
              onClick: () => {
                if (isDashboardHome && item.key === 'support') {
                  onOpenHomeSupportModal()
                  return
                }

                onNavigate(item.path)
              },
              onMouseEnter: () => {
                onPrefetch(item.path)
              },
            })),
          }))}
          className='border-none'
          inlineCollapsed={collapsed}
        />
      </div>

      <div className='logout-section'>
        <button
          onClick={onLogout}
          type='button'
          className='flex w-full items-center gap-3 border-none bg-transparent transition-opacity hover:opacity-80'
        >
          <span className='text-lg text-error'>
            <LogoutOutlined />
          </span>
          <span className='logout-text text-sm font-medium text-error'>
            Déconnexion
          </span>
        </button>
      </div>
    </div>
  )
}

function DashboardLayoutContent({ children }: { children?: ReactNode }) {
  const { user, isLoading, isAuthenticated, logout } = useAuth()
  const { collapsed, isDesktop, mobileMenuOpen, setMobileMenuOpen } =
    useLayout()
  const navigate = useNavigate()
  const location = useLocation()
  const router = useRouter()
  const [modal, contextHolder] = Modal.useModal()
  const [isHomeSupportModalOpen, setIsHomeSupportModalOpen] = useState(false)
  const isNavigatingRef = useRef(false)
  const prefetchedPathsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isNavigatingRef.current) {
      isNavigatingRef.current = true
      navigate('/auth/login', { replace: true })
    }

    if (isAuthenticated) {
      isNavigatingRef.current = false
    }
  }, [isLoading, isAuthenticated, navigate])

  const contextScore = user?.contextScore
  const hasContextScore = typeof contextScore === 'number'

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return

    const isContextOptionalRoute = CONTEXT_OPTIONAL_PATHS.some(
      path =>
        location.pathname === path || location.pathname.startsWith(path + '/')
    )

    if (!hasContextScore) return

    if (contextScore < 80 && !isContextOptionalRoute) {
      navigate('/context', { replace: true })
    }
  }, [
    isLoading,
    isAuthenticated,
    user,
    contextScore,
    hasContextScore,
    location.pathname,
    navigate,
  ])

  useEffect(() => {
    if (isDesktop) return

    setMobileMenuOpen(false)
  }, [isDesktop, location.pathname, setMobileMenuOpen])

  useEffect(() => {
    if (typeof document === 'undefined' || isDesktop || !mobileMenuOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isDesktop, mobileMenuOpen])

  useEffect(() => {
    if (!mobileMenuOpen) return

    const handleKeyDown = (event: { key: string }) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mobileMenuOpen, setMobileMenuOpen])

  const handleLogout = () => {
    modal.confirm({
      title: 'Déconnexion',
      content: 'Êtes-vous sûr de vouloir vous déconnecter ?',
      okText: 'Oui, me déconnecter',
      cancelText: 'Annuler',
      okButtonProps: { danger: true },
      onOk: logout,
    })
  }

  const isActive = (path: string) => {
    return (
      location.pathname === path || location.pathname.startsWith(path + '/')
    )
  }

  const isContextIncomplete = hasContextScore ? contextScore < 80 : false
  const isDashboardHome = location.pathname === '/dashboard'

  const getSelectedKey = () => {
    for (const section of menuSections) {
      for (const item of section.items) {
        if (isActive(item.path)) {
          return [item.key]
        }
      }
    }

    return []
  }

  const handleNavigate = (path: string) => {
    if (!isDesktop) {
      setMobileMenuOpen(false)
    }

    navigate(path)
  }

  const handleOpenHomeSupportModal = () => {
    if (!isDesktop) {
      setMobileMenuOpen(false)
    }

    setIsHomeSupportModalOpen(true)
  }

  const handlePrefetch = (path: string) => {
    if (
      path === location.pathname ||
      prefetchedPathsRef.current.has(path)
    ) {
      return
    }

    prefetchedPathsRef.current.add(path)

    void Promise.allSettled([
      router.preloadRoute({ to: path as never }),
      legacyRoutePrefetchers[path]?.() ?? Promise.resolve(),
    ]).then(results => {
      const hasFailure = results.some(result => result.status === 'rejected')

      if (hasFailure) {
        prefetchedPathsRef.current.delete(path)
      }
    })
  }

  if (isLoading || !isAuthenticated) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-[#fdfdfd]'>
        <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
      </div>
    )
  }

  return (
    <div className='min-h-screen'>
      {contextHolder}
      {isHomeSupportModalOpen ? (
        <Suspense fallback={null}>
          <LazySupportFeedbackModal
            open={isHomeSupportModalOpen}
            onClose={() => setIsHomeSupportModalOpen(false)}
            appArea='dashboard-home-aides'
            initialCategory='amelioration'
            subject="Besoin partagé depuis l'accueil"
            title='Dites-nous ce dont vous avez besoin'
            description='Votre retour nous aide à prioriser les évolutions les plus utiles.'
          />
        </Suspense>
      ) : null}

      <div className='relative flex min-h-screen w-full lg:p-4'>
        <button
          type='button'
          aria-label='Fermer le menu'
          onClick={() => setMobileMenuOpen(false)}
          className={`fixed inset-0 z-40 bg-black/20 transition-opacity duration-300 lg:hidden ${
            mobileMenuOpen
              ? 'pointer-events-auto opacity-100'
              : 'pointer-events-none opacity-0'
          }`}
        />

        <div
          className={`fixed inset-y-0 left-0 z-50 lg:hidden ${
            mobileMenuOpen ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <div
            className={`h-full transition-transform duration-300 ease-out ${
              mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <Sider
              collapsed={false}
              collapsedWidth={DESKTOP_COLLAPSED_WIDTH}
              width={DESKTOP_SIDER_WIDTH}
              trigger={null}
              style={{
                overflow: 'auto',
                height: '100vh',
                boxShadow: '0 16px 40px rgba(17, 27, 33, 0.12)',
              }}
            >
              <DashboardSidebarContent
                collapsed={false}
                isDashboardHome={isDashboardHome}
                isContextIncomplete={isContextIncomplete}
                onOpenHomeSupportModal={handleOpenHomeSupportModal}
                selectedKeys={getSelectedKey()}
                onLogout={handleLogout}
                onNavigate={handleNavigate}
                onPrefetch={handlePrefetch}
                user={user}
              />
            </Sider>
          </div>
        </div>

        <div className='hidden lg:block lg:flex-none'>
          <Sider
            collapsed={collapsed}
            collapsedWidth={DESKTOP_COLLAPSED_WIDTH}
            width={DESKTOP_SIDER_WIDTH}
            trigger={null}
            style={{
              overflow: 'auto',
              height: 'calc(100vh - 32px)',
              position: 'sticky',
              top: 16,
              left: 0,
            }}
          >
            <DashboardSidebarContent
              collapsed={collapsed}
              isDashboardHome={isDashboardHome}
              isContextIncomplete={isContextIncomplete}
              onOpenHomeSupportModal={handleOpenHomeSupportModal}
              selectedKeys={getSelectedKey()}
              onLogout={handleLogout}
              onNavigate={handleNavigate}
              onPrefetch={handlePrefetch}
              user={user}
            />
          </Sider>
        </div>

        <main className='flex min-w-0 flex-1 flex-col lg:pl-4'>
          <div className='min-h-screen bg-transparent lg:min-h-[calc(100vh-32px)]'>
            <div className='flex min-h-screen min-w-0 flex-col bg-white lg:min-h-[calc(100vh-32px)] lg:rounded-2xl lg:shadow-card'>
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default function DashboardLayout({
  children,
}: {
  children?: ReactNode
}) {
  return (
    <LayoutProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </LayoutProvider>
  )
}
