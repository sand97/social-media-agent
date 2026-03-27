import { createFileRoute } from '@tanstack/react-router'
import { LegacyStatsPage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/stats')({
  component: LegacyStatsPage,
})
