import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

interface LayoutContextType {
  collapsed: boolean
  isDesktop: boolean
  mobileMenuOpen: boolean
  toggleCollapsed: () => void
  toggleNavigation: () => void
  setCollapsed: (collapsed: boolean) => void
  setMobileMenuOpen: (open: boolean) => void
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined)

const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)'

function getIsDesktop() {
  if (typeof window === 'undefined') {
    return true
  }

  return window.matchMedia(DESKTOP_MEDIA_QUERY).matches
}

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(getIsDesktop)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY)
    const handleChange = (event: { matches: boolean }) => {
      setIsDesktop(event.matches)
    }

    setIsDesktop(mediaQuery.matches)

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }

    mediaQuery.addListener(handleChange)

    return () => mediaQuery.removeListener(handleChange)
  }, [])

  useEffect(() => {
    if (isDesktop) {
      setMobileMenuOpen(false)
    }
  }, [isDesktop])

  const toggleCollapsed = () => {
    setCollapsed(prev => !prev)
  }

  const toggleNavigation = () => {
    if (isDesktop) {
      setCollapsed(prev => !prev)
      return
    }

    setMobileMenuOpen(prev => !prev)
  }

  return (
    <LayoutContext.Provider
      value={{
        collapsed,
        isDesktop,
        mobileMenuOpen,
        toggleCollapsed,
        toggleNavigation,
        setCollapsed,
        setMobileMenuOpen,
      }}
    >
      {children}
    </LayoutContext.Provider>
  )
}

export function useLayout() {
  const context = useContext(LayoutContext)
  if (context === undefined) {
    throw new Error('useLayout must be used within a LayoutProvider')
  }
  return context
}
