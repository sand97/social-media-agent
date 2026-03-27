import { createFileRoute } from '@tanstack/react-router'
import { LegacyStatusSchedulerPage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/status-scheduler')({
  component: LegacyStatusSchedulerPage,
})
