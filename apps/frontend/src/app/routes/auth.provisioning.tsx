import { useAuth } from '@app/hooks/useAuth'
import apiClient from '@app/lib/api/client'
import {
  ProvisioningTimelineScreen,
  QrRetrievalScreen,
  type ProvisioningPayload,
} from '@app/components/auth-provisioning/ProvisioningScreens'
import { App } from 'antd'
import { io, type Socket } from 'socket.io-client'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

type ProvisioningLocationState = {
  deviceType?: 'mobile' | 'desktop'
  pairingToken?: string
  phoneNumber?: string
}

type PairingCodePayload = {
  code: string
  phoneNumber?: string
}

export default function AuthProvisioningPage() {
  const { notification } = App.useApp()
  const { login } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const state = (location.state || {}) as ProvisioningLocationState
  const pairingToken = state.pairingToken
  const deviceType = state.deviceType || 'desktop'
  const phoneNumber = state.phoneNumber

  const socketRef = useRef<Socket | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pairingCode, setPairingCode] = useState<PairingCodePayload | null>(null)
  const [provisioning, setProvisioning] = useState<ProvisioningPayload>({
    progress: 4,
    stage: 'SERVER_INITIALIZING',
  })
  const [qrCode, setQrCode] = useState<string | null>(null)

  useEffect(() => {
    if (!pairingToken) {
      navigate('/auth/login', { replace: true })
      return
    }

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'
    const socket = io(`${apiUrl}/auth`, {
      auth: { pairingToken },
      reconnectionAttempts: 8,
      reconnectionDelay: 1200,
      transports: ['websocket'],
      withCredentials: true,
    })

    socketRef.current = socket

    socket.on('auth:provisioning-update', (payload: ProvisioningPayload) => {
      setErrorMessage(null)
      setProvisioning(payload)
    })

    socket.on('auth:pairing-code-ready', (payload: PairingCodePayload) => {
      setPairingCode(payload)
    })

    socket.on('auth:qr-update', (payload: { qrCode: string }) => {
      setQrCode(payload.qrCode)
      setProvisioning(prev => ({
        ...prev,
        progress: 100,
        stage: 'QR_FETCHING',
      }))
    })

    socket.on('auth:connected', async () => {
      try {
        const response = await apiClient.post('/auth/confirm-pairing', {
          pairingToken,
        })

        if (response.data?.user) {
          login(response.data.user)
        }

        navigate(response.data?.redirectTo || '/context')
      } catch (error: unknown) {
        const err = error as { response?: { data?: { message?: string } } }
        setErrorMessage(
          err.response?.data?.message ||
            'La connexion WhatsApp a été détectée, mais la finalisation a échoué.'
        )
      }
    })

    socket.on('auth:error', (payload: { error?: string }) => {
      setErrorMessage(payload.error || 'La connexion a rencontré un problème.')
    })

    socket.on('connect_error', error => {
      setErrorMessage(error.message)
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [login, navigate, pairingToken])

  useEffect(() => {
    if (!pairingCode || !pairingToken) {
      return
    }

    notification.success({
      message: 'Code prêt',
      description: 'Le code de pairing a été généré pour votre numéro.',
    })

    navigate('/auth/verify-otp', {
      replace: true,
      state: {
        code: pairingCode.code,
        pairingToken,
        phoneNumber: pairingCode.phoneNumber || phoneNumber,
        scenario: 'pairing',
      },
    })
  }, [navigate, notification, pairingCode, pairingToken, phoneNumber])

  if (!pairingToken) {
    return null
  }

  if (deviceType === 'desktop') {
    return (
      <QrRetrievalScreen
        onBack={() => navigate('/auth/login')}
        qrCode={qrCode}
        subtitle={
          errorMessage ||
          "Votre stack est prête ou en train d'arriver. Nous récupérons le QR code dès que le connector l'émet."
        }
      />
    )
  }

  return (
    <ProvisioningTimelineScreen
      errorMessage={errorMessage}
      onBack={() => navigate('/auth/login')}
      payload={provisioning}
    />
  )
}
