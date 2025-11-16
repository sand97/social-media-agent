import {
  type RouteConfig,
  index,
  route,
  layout,
} from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  layout('layout/auth-layout.tsx', [
    route('auth/login', 'routes/auth.login.tsx'),
    route('auth/pairing-code', 'routes/auth.pairing-code.tsx'),
    route('auth/verify-otp', 'routes/auth.verify-otp.tsx'),
  ]),
  route('onboarding/import', 'routes/onboarding.import.tsx'),
  route('onboarding/review-products', 'routes/onboarding.review-products.tsx'),
  route('onboarding/business-info', 'routes/onboarding.business-info.tsx'),
  route('onboarding/advanced-options', 'routes/onboarding.advanced-options.tsx'),
] satisfies RouteConfig
