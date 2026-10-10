import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Vm } from '@/types/panel-vm'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { dashboardQueryOptions } from '@/features/overview/queries'
import {
  telemetryEnabled,
  telemetrySeedFlags,
} from '@/features/vm/telemetry-policy'

export function TelemetryPane() {
  const dash = useQuery(dashboardQueryOptions())
  const qc = useQueryClient()
  const vms: Vm[] = dash.data?.vms || []
  const apply = async (ids: string[] | null, enabled: boolean) => {
    const list = ids || vms.map((v) => v.id)
    const body = telemetrySeedFlags(enabled)
    let ok = 0
    let fail = 0
    for (const id of list) {
      try {
        await api(`/api/panel/vms/${id}/seed-settings`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        ok += 1
      } catch {
        fail += 1
      }
    }
    await qc.invalidateQueries({ queryKey: dashboardQueryOptions().queryKey })
    toast.success(
      fail
        ? `已写 ${ok}，失败 ${fail}`
        : `已${enabled ? '开启' : '关闭'} ${ok} 槽`
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>遥测</CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='flex gap-2'>
          <Button size='sm' onClick={() => apply(null, true)}>
            全开
          </Button>
          <Button
            size='sm'
            variant='outline'
            onClick={() => apply(null, false)}
          >
            全关
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>槽</TableHead>
              <TableHead>状态</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vms.map((vm) => {
              const on = telemetryEnabled(vm.seed_policy)
              return (
                <TableRow key={vm.id}>
                  <TableCell>{vm.id}</TableCell>
                  <TableCell>{on ? '开' : '关'}</TableCell>
                  <TableCell>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => apply([vm.id], !on)}
                    >
                      {on ? '关闭' : '开启'}
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
