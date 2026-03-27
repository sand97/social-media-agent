import { createFileRoute } from '@tanstack/react-router'
import { LegacyDashboardPage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/dashboard')({
  component: LegacyDashboardPage,
})
