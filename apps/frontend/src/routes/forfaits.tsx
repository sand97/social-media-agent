import { createFileRoute } from '@tanstack/react-router'
import { LegacyForfaitsRedirectPage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/forfaits')({
  component: LegacyForfaitsRedirectPage,
})
