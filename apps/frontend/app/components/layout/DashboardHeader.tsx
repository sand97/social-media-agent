import { CloseOutlined, MenuOutlined } from '@ant-design/icons'
import LayoutSidebar from '@app/assets/LayoutSidebar.svg?react'
import { useLayout } from '@app/contexts/LayoutContext'
import { Button } from 'antd'
import type { ReactNode } from 'react'

interface DashboardHeaderProps {
  title?: ReactNode
  right?: ReactNode
}

export function DashboardHeader({ title, right }: DashboardHeaderProps) {
  const { collapsed, isDesktop, mobileMenuOpen, toggleNavigation } = useLayout()

  const toggleLabel = isDesktop
    ? collapsed
      ? 'Déplier la navigation'
      : 'Réduire la navigation'
    : mobileMenuOpen
      ? 'Fermer le menu'
      : 'Ouvrir le menu'

  return (
    <div className='dashboard-header sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 rounded-t-2xl border-b border-gray-200 bg-white px-4'>
      <div className='flex min-w-0 items-center gap-3'>
        <span className='mr-1 border-r border-gray-200 pr-3'>
          <Button
            type='text'
            aria-label={toggleLabel}
            aria-expanded={!isDesktop && mobileMenuOpen}
            icon={
              isDesktop ? (
                <LayoutSidebar width={20} />
              ) : mobileMenuOpen ? (
                <CloseOutlined />
              ) : (
                <MenuOutlined />
              )
            }
            onClick={toggleNavigation}
          />
        </span>

        {title && (
          <span className='flex min-w-0 gap-2 text-sm font-semibold'>
            <span className='truncate'>{title}</span>
          </span>
        )}
      </div>
      {right && (
        <div className='dashboard-header__right flex shrink-0 items-center'>
          {right}
        </div>
      )}
    </div>
  )
}
