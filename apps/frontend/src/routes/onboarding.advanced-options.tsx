import { createFileRoute } from '@tanstack/react-router'
import { LegacyOnboardingAdvancedOptionsPage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/onboarding/advanced-options')({
  component: LegacyOnboardingAdvancedOptionsPage,
})
