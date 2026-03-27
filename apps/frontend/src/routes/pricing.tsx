import { createFileRoute } from '@tanstack/react-router'
import { LegacyPricingPage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/pricing')({
  component: LegacyPricingPage,
})
