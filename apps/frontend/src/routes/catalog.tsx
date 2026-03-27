import { createFileRoute } from '@tanstack/react-router'
import { LegacyCatalogPage } from '../lib/legacy/route-components'

export const Route = createFileRoute('/catalog')({
  component: LegacyCatalogPage,
})
