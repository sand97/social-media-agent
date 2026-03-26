import apiClient from '@app/lib/api/client'
import axios from 'axios'
import { createContext, useCallback, useEffect, useMemo, useState } from 'react'

interface AgentConfig {
  testPhoneNumbers: string[]
  testLabels: string[]
  labelsToNotReply: string[]
  productionEnabled: boolean
}

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
  agentConfig?: AgentConfig | null
  googleContacts?: {
    connected: boolean
    contactsCount: number
  }
  [key: string]: any
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (user?: User) => void
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  updateContextScore: (score: number) => void
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const login = useCallback((_userData?: User) => {
    if (_userData) {
      setUser(_userData)
      localStorage.setItem('user', JSON.stringify(_userData))
    }
  }, [])

  const logout = useCallback(async () => {
    setUser(null)
    localStorage.removeItem('user')
    try {
      await apiClient.post('/auth/logout')
    } catch {
      // Ignore errors during logout
    }
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
    const storedUser = localStorage.getItem('user')

    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser))
      } catch (error) {
        console.error('Failed to parse stored user:', error)
      }
    }

    // Verify token with backend (cookie sent automatically)
    try {
      const response = await apiClient.get('/auth/me')
      if (response.data) {
        setUser(response.data)
        localStorage.setItem('user', JSON.stringify(response.data))
      }
    } catch (error) {
      // Only logout on 401 (invalid/expired token), not on network errors
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        setUser(null)
        localStorage.removeItem('user')
      }
      // On network errors (backend down), keep the cached user
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const isAuthenticated = !!user

  const value = useMemo(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      login,
      logout,
      checkAuth,
      updateContextScore,
    }),
    [user, isAuthenticated, isLoading, login, logout, checkAuth, updateContextScore]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
