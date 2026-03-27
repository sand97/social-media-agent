import { createFileRoute } from '@tanstack/react-router'
import { LegacyAuthVerifyOtpPage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/auth/verify-otp')({
  component: LegacyAuthVerifyOtpPage,
})
