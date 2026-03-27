import { createFileRoute } from '@tanstack/react-router'
import { LegacyOnboardingReviewProductsPage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/onboarding/review-products')({
  component: LegacyOnboardingReviewProductsPage,
})
