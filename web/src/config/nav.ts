import {
  Box,
  Database,
  Download,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LineChart,
  List,
  MessageSquareText,
  Monitor,
  Network,
  Puzzle,
  ScrollText,
  Settings,
  Shield,
  Users,
} from 'lucide-react'

export type ViewId =
  | 'overview'
  | 'cluster'
  | 'vm'
  | 'import'
  | 'usage'
  | 'billing'
  | 'proxies'
  | 'models'
  | 'loadtest'
  | 'protocol'
  | 'system'
  | 'keys'
  | 'api'
  | 'logs'
  | 'database'
  | 'settings'
  | 'users'
  | 'wrap'

export const VIEW_TITLES: Record<ViewId, string> = {
  overview: '总览',
  cluster: '集群',
  vm: '虚拟机',
  import: '导入',
  usage: '用量',
  billing: '计费',
  proxies: '代理池',
  models: '模型',
  loadtest: '压测',
  protocol: '协议',
  system: 'system提示词',
  keys: '密钥',
  api: 'API',
  logs: '日志',
  database: '数据库',
  settings: '设置',
  users: '用户',
  wrap: '内核',
}

export const NAV_ITEMS: {
  id: ViewId
  url: string
  icon: typeof LayoutDashboard
}[] = [
  { id: 'overview', url: '/overview', icon: LayoutDashboard },
  { id: 'cluster', url: '/cluster', icon: Network },
  { id: 'vm', url: '/vm', icon: Monitor },
  { id: 'import', url: '/import', icon: Download },
  { id: 'usage', url: '/usage', icon: LineChart },
  { id: 'billing', url: '/billing', icon: LineChart },
  { id: 'proxies', url: '/proxies', icon: Shield },
  { id: 'models', url: '/models', icon: List },
  { id: 'loadtest', url: '/loadtest/reports', icon: Gauge },
  { id: 'protocol', url: '/protocol', icon: Box },
  { id: 'system', url: '/system', icon: MessageSquareText },
  { id: 'keys', url: '/keys', icon: KeyRound },
  { id: 'logs', url: '/logs', icon: ScrollText },
  { id: 'database', url: '/database', icon: Database },
  { id: 'settings', url: '/settings/sticky', icon: Settings },
  { id: 'wrap', url: '/wrap', icon: Puzzle },
  { id: 'users', url: '/users', icon: Users },
]
