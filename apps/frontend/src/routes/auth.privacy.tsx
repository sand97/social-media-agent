import { createFileRoute } from '@tanstack/react-router'
import { LegacyPrivacyPage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/auth/privacy')({
  component: LegacyPrivacyPage,
})
