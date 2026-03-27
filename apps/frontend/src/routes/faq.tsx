import { createFileRoute } from '@tanstack/react-router'
import { LegacyFaqPage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/faq')({
  component: LegacyFaqPage,
})
