import { queryOptions } from '@tanstack/react-query'
import type { PanelUsersPayload } from '@/types/panel-users'
import { api } from '@/lib/api'

export function usersQueryOptions() {
  return queryOptions({
    queryKey: ['panel', 'users'] as const,
    queryFn: () => api<PanelUsersPayload>('/api/panel/users'),
  })
}
