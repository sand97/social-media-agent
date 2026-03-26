import '@app/app.css'
import { AuthProvider } from '@app/contexts/AuthContext'
import { antdProviderProps } from '@app/core/theme'
import AuthLayout from '@app/layout/auth-layout'
import DashboardLayout from '@app/layout/dashboard-layout'
import LoginPage from '@app/routes/auth.login'
import PairingCodePage from '@app/routes/auth.pairing-code'
import PrivacyPage from '@app/routes/auth.privacy'
import TermsPage from '@app/routes/auth.terms'
import VerifyOtpPage from '@app/routes/auth.verify-otp'
import Catalog from '@app/routes/catalog'
import ContextOnboarding from '@app/routes/context.onboarding'
import Dashboard from '@app/routes/dashboard'
import FaqPage from '@app/routes/faq'
import Home from '@app/routes/home'
import LeadsPage from '@app/routes/leads'
import OnboardingAdvancedOptions from '@app/routes/onboarding.advanced-options'
import OnboardingBusinessInfo from '@app/routes/onboarding.business-info'
import OnboardingImport from '@app/routes/onboarding.import'
import OnboardingReviewProducts from '@app/routes/onboarding.review-products'
import PricingPage from '@app/routes/pricing'
import Stats from '@app/routes/stats'
import StatusScheduler from '@app/routes/status-scheduler'
import SupportPage from '@app/routes/support'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App as AntdApp, ConfigProvider } from 'antd'
import frFR from 'antd/locale/fr_FR'
import dayjs from 'dayjs'
import 'dayjs/locale/fr'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Navigate, createBrowserRouter, RouterProvider } from 'react-router-dom'

dayjs.locale('fr')

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
      {
        path: 'auth/privacy',
        element: <PrivacyPage />,
      },
      {
        path: 'auth/terms',
        element: <TermsPage />,
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
        path: 'leads',
        element: <LeadsPage />,
      },
      {
        path: 'orders',
        element: <Navigate to='/leads' replace />,
      },
      {
        path: 'pricing',
        element: <PricingPage />,
      },
      {
        path: 'forfaits',
        element: <Navigate to='/pricing' replace />,
      },
      {
        path: 'catalog',
        element: <Catalog />,
      },
      {
        path: 'status-scheduler',
        element: <StatusScheduler />,
      },
      {
        path: 'marketing',
        element: <Navigate to='/status-scheduler' replace />,
      },
      {
        path: 'context',
        element: <ContextOnboarding />,
      },
      {
        path: 'support',
        element: <SupportPage />,
      },
      {
        path: 'faq',
        element: <FaqPage />,
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
