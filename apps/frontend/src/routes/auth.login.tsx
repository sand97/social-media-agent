import { createFileRoute } from '@tanstack/react-router'
import { LegacyAuthLoginPage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/auth/login')({
  component: LegacyAuthLoginPage,
})
