import { createFileRoute } from '@tanstack/react-router'
import { LegacySupportPage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/support')({
  component: LegacySupportPage,
})
