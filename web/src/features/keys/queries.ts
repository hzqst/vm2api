import { queryOptions } from '@tanstack/react-query'
import type { ApiKeysPayload, KeyStatsPayload } from '@/types/panel-keys'
import { api } from '@/lib/api'

export function apiKeysQueryOptions() {
  return queryOptions({
    queryKey: ['panel', 'api-keys'] as const,
    queryFn: () => api<ApiKeysPayload>('/api/panel/api-keys'),
  })
}

export function keyStatsQueryOptions(id: string) {
  return queryOptions({
    queryKey: ['panel', 'api-keys', id, 'stats'] as const,
    queryFn: () =>
      api<KeyStatsPayload>(
        `/api/panel/api-keys/${encodeURIComponent(id)}/stats`
      ),
  })
}
