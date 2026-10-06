import { createFileRoute } from '@tanstack/react-router'
import { LogsPage } from '@/features/logs'
import { validateLogsSearch } from '@/features/logs/search'

export const Route = createFileRoute('/_authenticated/logs')({
  validateSearch: validateLogsSearch,
  component: LogsPage,
})
