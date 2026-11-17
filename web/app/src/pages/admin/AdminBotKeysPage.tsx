import { useState, type FormEvent } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useAsync } from '@/hooks/use-async'
import { adminApi } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { copyToClipboard } from '@/lib/clipboard'

export function AdminBotKeysPage() {
  const me = useAsync(() => adminApi.getAdminMe(), null)
  if (me.loading) return <p role="status">正在验证权限…</p>
  if (me.error) return <Alert variant="destructive"><AlertDescription>{me.error}<Button onClick={me.reload}>重试</Button></AlertDescription></Alert>
  if (!me.data?.permissions?.includes('*')) return <Alert><AlertDescription>仅主管理员可以管理机器人密钥。</AlertDescription></Alert>
  return <BotKeysManager />
}

function BotKeysManager() {
  const { data, loading, error, reload } = useAsync(() => adminApi.listBotKeys(), { keys: [] })
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [mutError, setMutError] = useState('')
  const [secret, setSecret] = useState('')
  const [pending, setPending] = useState<{ id: string; name: string } | null>(null)
  async function create(event: FormEvent) {
    event.preventDefault(); if (!name.trim() || busy || secret) return
    setBusy(true); setMutError('')
    try { const result = await adminApi.createBotKey(name.trim()); setSecret(result.key); setName(''); reload() }
    catch (err) { setMutError(getApiErrorMessage(err)) }
    finally { setBusy(false) }
  }
  async function revoke() {
    if (!pending || busy) return
    setBusy(true); setMutError('')
    try { await adminApi.revokeBotKey(pending.id); setPending(null); reload() }
    catch (err) { setMutError(getApiErrorMessage(err)) }
    finally { setBusy(false) }
  }
  const example = `curl '${window.location.origin}/api/v1/bot/users/123/financial-summary' \\\n  -H 'Authorization: Bearer YOUR_BOT_KEY'`
  return <>
    <PageHeader title="机器人密钥" description="授权机器人按用户 ID 查询余额、昨日和近七日消费。仅主管理员可管理。" />
    {mutError ? <Alert variant="destructive"><AlertDescription>{mutError}</AlertDescription></Alert> : null}
    <Card><CardHeader><CardTitle>创建密钥</CardTitle><CardDescription>专用于查询所有用户的财务摘要，不支持模型调用。密钥仅在创建时显示一次。</CardDescription></CardHeader>
      <CardContent><form onSubmit={create} className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-2" htmlFor="bot-key-name">密钥名称<Input id="bot-key-name" value={name} onChange={e => setName(e.target.value)} maxLength={64} required placeholder="例如：余额查询机器人" disabled={busy} /></label>
        <Button type="submit" disabled={busy || !name.trim() || !!secret}>{busy ? '处理中…' : '创建密钥'}</Button>
      </form></CardContent></Card>
    <Card><CardHeader><CardTitle>已创建的密钥</CardTitle><CardDescription>撤销后立即失效，机器人将无法继续使用该密钥。</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3">
        {loading ? <p role="status">正在加载密钥…</p> : error ? <Alert variant="destructive"><AlertDescription>{error}<Button variant="outline" onClick={reload}>重试列表</Button></AlertDescription></Alert> : data.keys.length === 0 ? <p className="text-muted-foreground">暂无机器人密钥，请先创建。</p> : data.keys.map(key => {
          const active = key.is_active === 'true' || key.is_active === 't'
          return <div key={key.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
            <div className="min-w-0 flex-1"><p className="break-words font-medium">{key.name}</p><p className="text-xs text-muted-foreground">ID {key.id} · {key.created_at}</p></div>
            <Badge variant={active ? 'secondary' : 'outline'}>{active ? '启用' : '已撤销'}</Badge>
            <Button variant="outline" size="sm" disabled={!active || busy} onClick={() => { setMutError(''); setPending({ id: key.id, name: key.name }) }}>撤销</Button>
          </div>
        })}
      </CardContent></Card>
    <Card><CardHeader><CardTitle>调用示例</CardTitle><CardDescription>将 123 替换为用户 ID，将 YOUR_BOT_KEY 替换为专用密钥。近七日为北京时间截至昨日的七个完整自然日，金额单位为人民币。</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3"><pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs">{example}</pre><Button variant="outline" className="self-start" onClick={() => void copyToClipboard(example)}>复制调用示例</Button></CardContent></Card>
    <Dialog open={!!secret} onOpenChange={open => { if (!open) setSecret('') }}><DialogContent onInteractOutside={event => event.preventDefault()}><DialogHeader><DialogTitle>保存机器人密钥</DialogTitle><DialogDescription>关闭后无法再次查看。请先复制并保存到机器人的安全配置中。</DialogDescription></DialogHeader>
      <Input aria-label="新机器人密钥" value={secret} readOnly className="font-mono text-xs" />
      <DialogFooter><Button variant="outline" onClick={() => void copyToClipboard(secret)}>复制密钥</Button><Button onClick={() => setSecret('')}>已保存，关闭</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={!!pending} onOpenChange={open => { if (!open && !busy) setPending(null) }}><DialogContent><DialogHeader><DialogTitle>撤销机器人密钥？</DialogTitle><DialogDescription>“{pending?.name}”将立即失效，此操作无法恢复。</DialogDescription></DialogHeader>
      {mutError ? <p role="alert">{mutError}</p> : null}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setPending(null)}>取消</Button><Button variant="destructive" disabled={busy} onClick={() => void revoke()}>{busy ? '撤销中…' : '确认撤销'}</Button></DialogFooter>
    </DialogContent></Dialog>
  </>
}
