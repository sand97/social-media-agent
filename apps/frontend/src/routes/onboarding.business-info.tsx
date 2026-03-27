import { createFileRoute } from '@tanstack/react-router'
import { LegacyOnboardingBusinessInfoPage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/onboarding/business-info')({
  component: LegacyOnboardingBusinessInfoPage,
})
