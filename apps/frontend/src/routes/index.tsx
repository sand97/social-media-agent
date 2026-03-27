import { createFileRoute } from '@tanstack/react-router'
import { LegacyHomePage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/')({
  component: LegacyHomePage,
})
