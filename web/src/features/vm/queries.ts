import { queryOptions } from '@tanstack/react-query'
import type {
  OfficialCcBootstrapPayload,
  SetupTokenSession,
  TestModelsPayload,
  VmCredentialResponse,
  VmDetailPayload,
  VmsListResponse,
} from '@/types/panel-vm'
import { api } from '@/lib/api'

export function vmsListQueryOptions(refetchInterval?: number) {
  return queryOptions({
    queryKey: ['panel', 'vms'] as const,
    queryFn: async () => {
      const data = await api<VmsListResponse>('/api/panel/vms')
      return { items: data.items || [], pool_queue: data.pool_queue }
    },
    ...(refetchInterval
      ? { refetchInterval, refetchOnWindowFocus: false }
      : {}),
  })
}

export function vmQueryOptions(id: string) {
  return queryOptions({
    queryKey: ['panel', 'vm', id] as const,
    queryFn: () =>
      api<VmDetailPayload>(`/api/panel/vms/${encodeURIComponent(id)}`),
  })
}

export function vmSeedQueryOptions(id: string) {
  return queryOptions({
    queryKey: ['panel', 'vm', id, 'seed'] as const,
    queryFn: () =>
      api<Record<string, unknown>>(
        `/api/panel/vms/${encodeURIComponent(id)}/seed-settings`
      ),
  })
}

export function vmCredentialQueryOptions(id: string, enabled = true) {
  return queryOptions({
    queryKey: ['panel', 'vm', id, 'credential'] as const,
    queryFn: () =>
      api<VmCredentialResponse>(
        `/api/panel/vms/${encodeURIComponent(id)}/oauth/credential`
      ),
    enabled,
    gcTime: 0,
    staleTime: 0,
  })
}

export function testModelsQueryOptions(vmId: string) {
  const q = vmId ? `?vm_id=${encodeURIComponent(vmId)}` : ''
  return queryOptions({
    queryKey: ['panel', 'test-models', vmId || ''] as const,
    queryFn: () => api<TestModelsPayload>(`/api/panel/test-models${q}`),
    enabled: !!vmId,
  })
}

export function setupTokenSessionQueryOptions(id: string, enabled = true) {
  return queryOptions({
    queryKey: ['panel', 'vm', id, 'setup-token-session'] as const,
    queryFn: () =>
      api<SetupTokenSession>(
        `/api/panel/vms/${encodeURIComponent(id)}/oauth/setup-token-session`
      ),
    enabled: enabled && !!id,
    staleTime: 10_000,
    retry: false,
  })
}

export function officialCcBootstrapQueryOptions(id: string, enabled = true) {
  return queryOptions({
    queryKey: ['panel', 'official-cc-bootstrap', id] as const,
    queryFn: () =>
      api<OfficialCcBootstrapPayload>(
        `/api/panel/vms/${encodeURIComponent(id)}/official-cc-bootstrap`
      ),
    enabled,
    refetchInterval: (query) =>
      query.state.data?.status?.status === 'running' ? 2500 : false,
  })
}

export function vmOfficialCcQueryOptions(id: string) {
  return queryOptions({
    queryKey: ['panel', 'vm', id, 'official-cc'] as const,
    queryFn: async () => {
      const response = await api<OfficialCcBootstrapPayload>(
        `/api/panel/vms/${encodeURIComponent(id)}/official-cc-bootstrap`
      )
      return response.status || null
    },
    refetchInterval: (query) =>
      query.state.data?.status === 'running' ? 2500 : false,
  })
}
