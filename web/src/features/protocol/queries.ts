import { queryOptions } from '@tanstack/react-query'
import type {
  DistillRules,
  JevInterceptConfig,
  RefusalGuardConfig,
} from '@/types/panel-routing'
import { api } from '@/lib/api'

export function distillQueryOptions() {
  return queryOptions({
    queryKey: ['panel', 'distill'] as const,
    queryFn: () => api<DistillRules>('/api/panel/distill'),
  })
}

export function refusalGuardsQueryOptions() {
  return queryOptions({
    queryKey: ['panel', 'refusal-guards'] as const,
    queryFn: () => api<RefusalGuardConfig>('/api/panel/refusal-guards'),
  })
}

export function jevInterceptQueryOptions() {
  return queryOptions({
    queryKey: ['panel', 'jev-intercept'] as const,
    queryFn: () => api<JevInterceptConfig>('/api/panel/jev-intercept'),
  })
}
