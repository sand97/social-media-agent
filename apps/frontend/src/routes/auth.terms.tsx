import { createFileRoute } from '@tanstack/react-router'
import { LegacyTermsPage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/auth/terms')({
  component: LegacyTermsPage,
})
