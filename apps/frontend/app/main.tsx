import '@app/app.css'
import { AuthProvider } from '@app/contexts/AuthContext'
import { antdProviderProps } from '@app/core/theme'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider, App as AntdApp } from 'antd'
import frFR from 'antd/locale/fr_FR'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom'

// Layouts
import AuthLayout from '@app/layout/auth-layout'
import DashboardLayout from '@app/layout/dashboard-layout'

// Pages
import Home from '@app/routes/home'
import LoginPage from '@app/routes/auth.login'
import PairingCodePage from '@app/routes/auth.pairing-code'
import VerifyOtpPage from '@app/routes/auth.verify-otp'
import Dashboard from '@app/routes/dashboard'
import Stats from '@app/routes/stats'
import Catalog from '@app/routes/catalog'
import ContextOnboarding from '@app/routes/context.onboarding'
import OnboardingImport from '@app/routes/onboarding.import'
import OnboardingReviewProducts from '@app/routes/onboarding.review-products'
import OnboardingBusinessInfo from '@app/routes/onboarding.business-info'
import OnboardingAdvancedOptions from '@app/routes/onboarding.advanced-options'

const queryClient = new QueryClient()

const router = createBrowserRouter([
  {
    path: '/',
    element: <Home />,
  },
  {
    element: <AuthLayout />,
    children: [
      {
        path: 'auth/login',
        element: <LoginPage />,
      },
      {
        path: 'auth/pairing-code',
        element: <PairingCodePage />,
      },
      {
        path: 'auth/verify-otp',
        element: <VerifyOtpPage />,
      },
    ],
  },
  {
    element: <DashboardLayout />,
    children: [
      {
        path: 'dashboard',
        element: <Dashboard />,
      },
      {
        path: 'stats',
        element: <Stats />,
      },
      {
        path: 'catalog',
        element: <Catalog />,
      },
      {
        path: 'context',
        element: <ContextOnboarding />,
      },
    ],
  },
  {
    path: 'onboarding/import',
    element: <OnboardingImport />,
  },
  {
    path: 'onboarding/review-products',
    element: <OnboardingReviewProducts />,
  },
  {
    path: 'onboarding/business-info',
    element: <OnboardingBusinessInfo />,
  },
  {
    path: 'onboarding/advanced-options',
    element: <OnboardingAdvancedOptions />,
  },
])

function App() {
  return (
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider {...antdProviderProps} locale={frFR}>
          <AntdApp>
            <AuthProvider>
              <RouterProvider router={router} />
            </AuthProvider>
          </AntdApp>
        </ConfigProvider>
      </QueryClientProvider>
    </React.StrictMode>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
