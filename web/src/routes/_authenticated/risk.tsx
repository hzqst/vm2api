import { createFileRoute } from '@tanstack/react-router'
import { RiskAuditPage } from '@/features/risk'
import { type ViewKey, isViewKey } from '@/features/risk/model'

export const Route = createFileRoute('/_authenticated/risk')({
  validateSearch: (search: Record<string, unknown>): { view?: ViewKey } => ({
    view:
      isViewKey(search.view) && search.view !== 'all' ? search.view : undefined,
  }),
  component: RiskAuditPage,
})
