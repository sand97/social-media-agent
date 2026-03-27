import { createFileRoute } from '@tanstack/react-router'
import { LegacyAuthProvisioningDebugPage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/auth/provisioning-debug')({
  component: LegacyAuthProvisioningDebugPage,
})
