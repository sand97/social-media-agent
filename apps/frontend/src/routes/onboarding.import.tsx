import { createFileRoute } from '@tanstack/react-router'
import { LegacyOnboardingImportPage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/onboarding/import')({
  component: LegacyOnboardingImportPage,
})
