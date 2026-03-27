import { createFileRoute } from '@tanstack/react-router'
import { LegacyAuthProvisioningPage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/auth/provisioning')({
  component: LegacyAuthProvisioningPage,
})
