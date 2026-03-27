import { createFileRoute } from '@tanstack/react-router'
import { LegacyOrdersRedirectPage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/orders')({
  component: LegacyOrdersRedirectPage,
})
