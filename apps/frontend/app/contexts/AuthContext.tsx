import apiClient from '@app/lib/api/client'
import { createContext, useCallback, useEffect, useMemo, useState } from 'react'

interface User {
  id: string
  email?: string
  phoneNumber?: string
  contextScore?: number
  whatsappProfile?: {
    pushname?: string
    [key: string]: any
  }
  businessInfo?: {
    avatar_url?: string
    profile_name?: string
    [key: string]: any
  }
  [key: string]: any
}

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (token: string, user?: User) => void
  logout: () => void
  checkAuth: () => Promise<void>
  updateContextScore: (score: number) => void
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const login = useCallback((newToken: string, userData?: User) => {
    setToken(newToken)
    localStorage.setItem('auth_token', newToken)

    if (userData) {
      setUser(userData)
      localStorage.setItem('user', JSON.stringify(userData))
    }
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user')
  }, [])

  const updateContextScore = useCallback((score: number) => {
    setUser(prev => {
      if (!prev) return prev
      const updated = { ...prev, contextScore: score }
      localStorage.setItem('user', JSON.stringify(updated))
      return updated
    })
  }, [])

  const checkAuth = useCallback(async () => {
    const storedToken = localStorage.getItem('auth_token')
    const storedUser = localStorage.getItem('user')

    if (!storedToken) {
      setIsLoading(false)
      return
    }

    setToken(storedToken)

    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser))
      } catch (error) {
        console.error('Failed to parse stored user:', error)
      }
    }

    // Verify token with backend
    try {
      const response = await apiClient.get('/auth/me')
      if (response.data) {
        setUser(response.data)
        localStorage.setItem('user', JSON.stringify(response.data))
      }
    } catch (error) {
      // Token is invalid, clear auth state
      logout()
    } finally {
      setIsLoading(false)
    }
  }, [logout])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const isAuthenticated = !!token && !!user

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated,
      isLoading,
      login,
      logout,
      checkAuth,
      updateContextScore,
    }),
    [user, token, isAuthenticated, isLoading, login, logout, checkAuth, updateContextScore]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
