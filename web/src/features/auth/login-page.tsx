import { useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { loginRequest } from '@/lib/api'
import { apiBase, sameOriginPanel, setApiBase } from '@/lib/session'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function LoginPage() {
  const navigate = useNavigate()
  const search = useSearch({ from: '/login' })
  const signIn = useAuthStore((s) => s.signIn)
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [base, setBase] = useState(apiBase())
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const hideBase = sameOriginPanel()

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setPending(true)
    try {
      if (hideBase) setApiBase('')
      else setApiBase(base)
      const result = await loginRequest({
        username: username.trim(),
        password,
        base: hideBase ? '' : base.trim().replace(/\/$/, '') || apiBase(),
      })
      signIn(result.token, result.user)
      toast.success('登录成功')
      const next = search.redirect
      if (next && next.startsWith('#/')) {
        window.location.hash = next.replace(/^#/, '')
        return
      }
      await navigate({ to: '/overview' })
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className='flex min-h-svh items-center justify-center bg-background p-6'>
      <Card className='w-full max-w-sm'>
        <CardHeader>
          <CardTitle className='text-xl'>vm2api</CardTitle>
          <p className='text-sm text-muted-foreground'>号池管理台</p>
        </CardHeader>
        <CardContent>
          <form className='space-y-4' onSubmit={onSubmit}>
            <div className='space-y-2'>
              <Label htmlFor='username'>用户名</Label>
              <Input
                id='username'
                autoComplete='username'
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='password'>密码</Label>
              <Input
                id='password'
                type='password'
                autoComplete='current-password'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {hideBase ? null : (
              <div className='space-y-2'>
                <Label htmlFor='api-base'>API Base</Label>
                <Input
                  id='api-base'
                  placeholder='http://127.0.0.1:8787'
                  value={base}
                  onChange={(e) => setBase(e.target.value)}
                />
              </div>
            )}
            {error ? <p className='text-sm text-destructive'>{error}</p> : null}
            <Button className='w-full' type='submit' disabled={pending}>
              {pending ? '登录中…' : '登录'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
