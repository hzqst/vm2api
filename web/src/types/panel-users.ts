import type { PanelRole } from './panel-auth'

export type PanelUser = {
  id: string
  username: string
  role: PanelRole
  enabled: boolean
  vm_create_quota?: number
  created_at?: string
  last_login_at?: string
}

export type PanelUsersPayload = {
  items?: PanelUser[]
}
