import {
  AuthRouteSkeleton,
  DashboardRouteSkeleton,
  DocumentRouteSkeleton,
  HomeRouteSkeleton,
  OnboardingRouteSkeleton,
} from '@app/components/ui/RouteSkeletons'
import {
  LegacyRedirect,
  createLegacyRouteComponent,
} from './create-legacy-route-component'

export const LegacyHomePage = createLegacyRouteComponent(
  () => import('@app/routes/home'),
  <HomeRouteSkeleton />
)

export const LegacyAuthLoginPage = createLegacyRouteComponent(
  () => import('@app/routes/auth.login'),
  <AuthRouteSkeleton />,
  'auth'
)

export const LegacyAuthPairingCodePage = createLegacyRouteComponent(
  () => import('@app/routes/auth.pairing-code'),
  <AuthRouteSkeleton />,
  'auth'
)

export const LegacyAuthProvisioningPage = createLegacyRouteComponent(
  () => import('@app/routes/auth.provisioning'),
  <AuthRouteSkeleton />,
  'auth'
)

export const LegacyAuthProvisioningDebugPage = createLegacyRouteComponent(
  () => import('@app/routes/auth.provisioning-debug'),
  <AuthRouteSkeleton />,
  'auth'
)

export const LegacyAuthVerifyOtpPage = createLegacyRouteComponent(
  () => import('@app/routes/auth.verify-otp'),
  <AuthRouteSkeleton />,
  'auth'
)

export const LegacyPrivacyPage = createLegacyRouteComponent(
  () => import('@app/routes/auth.privacy'),
  <DocumentRouteSkeleton />,
  'auth'
)

export const LegacyTermsPage = createLegacyRouteComponent(
  () => import('@app/routes/auth.terms'),
  <DocumentRouteSkeleton />,
  'auth'
)

export const LegacyDashboardPage = createLegacyRouteComponent(
  () => import('@app/routes/dashboard'),
  <DashboardRouteSkeleton />,
  'dashboard'
)

export const LegacyStatsPage = createLegacyRouteComponent(
  () => import('@app/routes/stats'),
  <DashboardRouteSkeleton />,
  'dashboard'
)

export const LegacyLeadsPage = createLegacyRouteComponent(
  () => import('@app/routes/leads'),
  <DashboardRouteSkeleton />,
  'dashboard'
)

export const LegacyPricingPage = createLegacyRouteComponent(
  () => import('@app/routes/pricing'),
  <DashboardRouteSkeleton />,
  'dashboard'
)

export const LegacyCatalogPage = createLegacyRouteComponent(
  () => import('@app/routes/catalog'),
  <DashboardRouteSkeleton />,
  'dashboard'
)

export const LegacyStatusSchedulerPage = createLegacyRouteComponent(
  () => import('@app/routes/status-scheduler'),
  <DashboardRouteSkeleton />,
  'dashboard'
)

export const LegacyContextPage = createLegacyRouteComponent(
  () => import('@app/routes/context.onboarding'),
  <DashboardRouteSkeleton />,
  'dashboard'
)

export const LegacySupportPage = createLegacyRouteComponent(
  () => import('@app/routes/support'),
  <DashboardRouteSkeleton />,
  'dashboard'
)

export const LegacyFaqPage = createLegacyRouteComponent(
  () => import('@app/routes/faq'),
  <DashboardRouteSkeleton />,
  'dashboard'
)

export const LegacyOnboardingImportPage = createLegacyRouteComponent(
  () => import('@app/routes/onboarding.import'),
  <OnboardingRouteSkeleton />
)

export const LegacyOnboardingReviewProductsPage = createLegacyRouteComponent(
  () => import('@app/routes/onboarding.review-products'),
  <OnboardingRouteSkeleton />
)

export const LegacyOnboardingBusinessInfoPage = createLegacyRouteComponent(
  () => import('@app/routes/onboarding.business-info'),
  <OnboardingRouteSkeleton />
)

export const LegacyOnboardingAdvancedOptionsPage = createLegacyRouteComponent(
  () => import('@app/routes/onboarding.advanced-options'),
  <OnboardingRouteSkeleton />
)

export function LegacyOrdersRedirectPage() {
  return <LegacyRedirect to='/leads' />
}

export function LegacyForfaitsRedirectPage() {
  return <LegacyRedirect to='/pricing' />
}

export function LegacyMarketingRedirectPage() {
  return <LegacyRedirect to='/status-scheduler' />
}
