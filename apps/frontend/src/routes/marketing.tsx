import { createFileRoute } from '@tanstack/react-router'
import { LegacyMarketingRedirectPage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/marketing')({
  component: LegacyMarketingRedirectPage,
})
