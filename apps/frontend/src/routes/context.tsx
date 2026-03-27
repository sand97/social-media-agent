import { createFileRoute } from '@tanstack/react-router'
import { LegacyContextPage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/context')({
  component: LegacyContextPage,
})
