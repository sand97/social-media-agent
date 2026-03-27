import { createFileRoute } from '@tanstack/react-router'
import { LegacyAuthPairingCodePage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/auth/pairing-code')({
  component: LegacyAuthPairingCodePage,
})
