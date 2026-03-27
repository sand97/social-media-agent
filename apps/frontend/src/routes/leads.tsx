import { createFileRoute } from '@tanstack/react-router'
import { LegacyLeadsPage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/leads')({
  component: LegacyLeadsPage,
})
