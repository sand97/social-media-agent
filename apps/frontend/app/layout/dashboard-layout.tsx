import {
  HomeOutlined,
  BarChartOutlined,
  ShoppingCartOutlined,
  SettingOutlined,
  ShopOutlined,
  NotificationOutlined,
  CustomerServiceOutlined,
  QuestionCircleOutlined,
  UserOutlined,
  LoadingOutlined,
  LogoutOutlined,
} from '@ant-design/icons'
import { useAuth } from '@app/hooks/useAuth'
import { Avatar, Spin, Divider, Modal } from 'antd'
import { useEffect, useRef } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'

interface MenuItem {
  key: string
  label: string
  icon: React.ReactNode
  path: string
}

const menuSections = [
  {
    title: 'Compte',
    items: [
      {
        key: 'home',
        label: 'Accueil',
        icon: <HomeOutlined />,
        path: '/dashboard',
      },
      {
        key: 'stats',
        label: 'Statistiques',
        icon: <BarChartOutlined />,
        path: '/stats',
      },
      {
        key: 'orders',
        label: 'Commandes',
        icon: <ShoppingCartOutlined />,
        path: '/orders',
      },
    ],
  },
  {
    title: 'Configuration',
    items: [
      {
        key: 'context',
        label: "Contexte de l'IA",
        icon: <SettingOutlined />,
        path: '/context',
      },
      {
        key: 'catalog',
        label: 'Catalogue',
        icon: <ShopOutlined />,
        path: '/catalog',
      },
      {
        key: 'marketing',
        label: 'Marketing',
        icon: <NotificationOutlined />,
        path: '/marketing',
      },
      {
        key: 'support',
        label: 'Support',
        icon: <CustomerServiceOutlined />,
        path: '/support',
      },
    ],
  },
  {
    title: 'Aides',
    items: [
      {
        key: 'faq',
        label: 'FAQ',
        icon: <QuestionCircleOutlined />,
        path: '/faq',
      },
      {
        key: 'help',
        label: 'Support',
        icon: <QuestionCircleOutlined />,
        path: '/help',
      },
    ],
  },
]

export default function DashboardLayout() {
  const { user, isLoading, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [modal, contextHolder] = Modal.useModal()
  const isNavigatingRef = useRef(false)

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isNavigatingRef.current) {
      isNavigatingRef.current = true
      navigate('/auth/login', { replace: true })
    }
    // Reset when authenticated
    if (isAuthenticated) {
      isNavigatingRef.current = false
    }
  }, [isLoading, isAuthenticated, navigate])

  // Redirect to context if score < 80% and trying to access restricted routes
  const contextScore = user?.contextScore ?? 0
  useEffect(() => {
    // Only run this check when user is authenticated and loaded
    if (isLoading || !isAuthenticated || !user) return

    const isContextRoute = location.pathname === '/context'

    // If score < 80% and not on context route, redirect to context
    if (contextScore < 80 && !isContextRoute) {
      navigate('/context', { replace: true })
    }
  }, [isLoading, isAuthenticated, user, contextScore, location.pathname, navigate])

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

  // Check if context score is below 80% - only context menu should be active
  const isContextIncomplete = (user?.contextScore ?? 0) < 80

  const renderMenuItem = (item: MenuItem) => {
    // Only context menu is enabled when score < 80%
    const isDisabled = isContextIncomplete && item.key !== 'context'

    return (
      <button
        key={item.key}
        onClick={() => !isDisabled && navigate(item.path)}
        type='button'
        disabled={isDisabled}
        className={`
          flex items-center gap-[10px] px-4 py-2 rounded-xl w-full text-left bg-transparent border-none
          ${
            isDisabled
              ? 'cursor-not-allowed opacity-40'
              : isActive(item.path)
                ? 'shadow-[0px_0px_1px_0px_rgba(0,0,0,0.4)] bg-white font-medium cursor-pointer'
                : 'hover:bg-white hover:shadow-[0px_0px_1px_0px_rgba(0,0,0,0.2)] cursor-pointer'
          }
        `}
      >
        <span className='text-lg'>{item.icon}</span>
        <span className='text-base text-primary-text leading-4'>
          {item.label}
        </span>
      </button>
    )
  }

  if (isLoading) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-[#fdfdfd]'>
        <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
      </div>
    )
  }

  if (!isAuthenticated) {
    // Show loading while redirect happens via useEffect
    return (
      <div className='min-h-screen flex items-center justify-center bg-[#fdfdfd]'>
        <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
      </div>
    )
  }

  return (
    <div className='min-h-screen flex max-w-[1290px] mx-auto'>
      {contextHolder}
      {/* Sidebar */}
      <aside className='w-[296px] h-screen overflow-y-auto px-4 pt-20 pb-6 flex flex-col gap-12'>
        {/* User Profile */}
        <div className='flex items-center gap-2'>
          <Avatar
            size={40}
            src={user?.businessInfo?.avatar_url}
            icon={!user?.businessInfo?.avatar_url && <UserOutlined />}
            className='bg-[#bfbfbf] flex-shrink-0'
          />
          <div className='flex flex-col gap-2'>
            <div className='flex items-center gap-2.5'>
              {user?.whatsappProfile?.pushname && (
                <span className='font-medium text-base text-black leading-4 tracking-[0.35px]'>
                  {user?.whatsappProfile?.pushname}
                </span>
              )}
              <span className='bg-[#af52de] text-white text-xs px-2 py-1 rounded leading-3 tracking-[0.35px]'>
                Free
              </span>
            </div>
            <span className='text-sm text-[#494949] leading-[14px] tracking-[0.35px]'>
              {user?.phoneNumber}
            </span>
          </div>
        </div>

        {/* Menu Sections */}
        {menuSections.map(section => (
          <div key={section.title} className='flex flex-col gap-3'>
            <div className='px-4'>
              <span className='text-sm text-[#494949] leading-4 tracking-[0.35px]'>
                {section.title}
              </span>
            </div>
            {section.items.map(renderMenuItem)}
          </div>
        ))}

        {/* Logout Button */}
        <div className='mt-auto px-4'>
          <Divider className='!mb-6' />
          <button
            onClick={handleLogout}
            type='button'
            className='flex items-center gap-[10px] w-full text-left bg-transparent border-none cursor-pointer hover:opacity-80 transition-opacity'
          >
            <span className='text-lg text-[#ff4d4f]'>
              <LogoutOutlined />
            </span>
            <span className='text-base text-[#ff4d4f] leading-4 tracking-[0.35px] font-medium'>
              Déconnexion
            </span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className='flex-1 py-12 px-2 h-screen overflow-y-auto'>
        <Outlet />
      </main>
    </div>
  )
}
