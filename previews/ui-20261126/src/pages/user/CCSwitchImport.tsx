import { useRoleToken, useLoginRequested } from '@/hooks/use-role-token'
import { LoginRequired } from '@/components/shared/LoginRequired'
import { useAsync } from '@/hooks/use-async'
import './cc-switch-button.css'
import { userApi, type ApiKeyRecord } from '@/lib/api/user'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import { useSiteSettings } from '@/hooks/use-site-settings'
import { buildCCSwitchLink, type CCSwitchApp } from '@/lib/cc-switch'

type ImportKey = { id: string; name: string; key: string; unavailable?: boolean }
export function CCSwitchImport({ keys, selectedId, disabled = false }: { keys?: ImportKey[]; selectedId?: string; disabled?: boolean }) {
  const token = useRoleToken()
  const loginOpen = useLoginRequested()
  const [open, setOpen] = useState(false)
  return <>
    <Button variant="default" size="sm" className={keys ? 'cc-switch-launch cc-switch-launch-compact' : 'cc-switch-launch'} aria-label="导入 CC Switch" title="导入 CC Switch" disabled={disabled} onClick={() => setOpen(true)}>
      <><img src={import.meta.env.BASE_URL + "cc-switch.png"} alt="" width={24} height={24} /><span className="cc-switch-launch-copy"><span className="cc-switch-launch-name">CC Switch</span><span className="cc-switch-launch-action">一键导入</span></span></>
    </Button>
    <Dialog open={open && !loginOpen} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>导入 CC Switch</DialogTitle><DialogDescription>选择客户端，将本站地址和密钥导入 CC Switch。</DialogDescription></DialogHeader>
        {open ? (keys ? <ImportForm keys={keys} selectedId={selectedId} /> : token ? <LoadImportKeys /> : <LoginRequired />) : null}
      </DialogContent>
    </Dialog>
  </>
}

function ImportForm({ keys, selectedId }: { keys: ImportKey[]; selectedId?: string }) {
  const { settings } = useSiteSettings()
  const [keyId, setKeyId] = useState(selectedId ?? keys.find(item => !item.unavailable)?.id ?? '')
  const selected = keys.find(item => item.id === keyId)
  const canImport = Boolean(selected?.key && !selected.unavailable)
  const [app, setApp] = useState<CCSwitchApp>('claude')
  const [model, setModel] = useState('')
  const [catalog, setCatalog] = useState<{ key: string; models: string[]; error?: string }>()
  const [retry, setRetry] = useState(0)
  const rawKey = canImport ? selected!.key : ''
  useEffect(() => {
    if (app !== 'codex' || !rawKey) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 15000)
    let active = true
    fetch('/api/user/channels', { headers: { Authorization: 'Bearer ' + rawKey }, cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('加载模型失败，请重试')
        const body = await response.json()
        if (!Array.isArray(body.channels)) throw new Error('模型列表格式异常')
        const models = [...new Set<string>(body.channels.filter((c: { type?: string }) => c.type === 'llm').map((c: { routing_model?: string }) => c.routing_model?.trim()).filter((name: unknown): name is string => typeof name === 'string' && Boolean(name)))].sort()
        if (active) setCatalog({ key: rawKey, models })
      })
      .catch(() => { if (active) setCatalog({ key: rawKey, models: [], error: '加载模型失败，请重试' }) })
      .finally(() => window.clearTimeout(timer))
    return () => { active = false; window.clearTimeout(timer); controller.abort() }
  }, [app, rawKey, retry])
  const models = catalog?.key === rawKey ? catalog.models : []
  const modelError = catalog?.key === rawKey ? catalog.error : undefined
  const loadingModels = app === 'codex' && Boolean(rawKey) && catalog?.key !== rawKey
  const importModel = app === 'codex' ? (models.includes(model) ? model : models[0] ?? '') : model
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  return <form className="flex flex-col gap-4" onSubmit={(event) => {
    event.preventDefault()
    try {
      if (app === 'codex' && !importModel) throw new Error('请先选择可用模型')
      if (!canImport) throw new Error('请选择可用的 API 密钥')
      const link = buildCCSwitchLink({ app, origin: window.location.origin, name: settings.siteName, apiKey: selected!.key, model: importModel })
      window.location.href = link
      setError('')
      setSent(true)
    } catch (err) { setError(err instanceof Error ? err.message : '无法生成导入链接') }
  }}>
    <Label htmlFor="cc-switch-app">客户端</Label>
    <NativeSelect id="cc-switch-app" value={app} onChange={(event) => { setApp(event.target.value as CCSwitchApp); setModel(''); setSent(false) }}>
      <option value="claude">Claude Code</option><option value="codex">Codex</option>
    </NativeSelect>
    {selectedId ? <p className="text-sm">当前密钥：{selected?.name ?? '不可用'}</p> : <>
    <Label htmlFor="cc-switch-key">选择 API 密钥</Label>
    <NativeSelect id="cc-switch-key" value={keyId} required onChange={(event) => { setKeyId(event.target.value); setModel(''); setSent(false); setError('') }}>
      <option value="" disabled>请选择已创建的密钥</option>
      {keys.map(item => <option key={item.id} value={item.id} disabled={item.unavailable}>{item.name}{item.unavailable ? '（不可导入）' : ''}</option>)}
    </NativeSelect>
    </>}
    {!canImport ? <p className="text-sm text-muted-foreground">此密钥已停用、未绑定分组或无法读取完整值，请选择其他密钥或新建密钥。</p> : null}
    <Label htmlFor="cc-switch-model">模型名称{app === 'claude' ? '（可选）' : ''}</Label>
    {app === 'codex' ? <>
      <NativeSelect id="cc-switch-model" value={importModel} disabled={loadingModels || !models.length} required onChange={event => { setModel(event.target.value); setSent(false) }}>
        {!models.length ? <option value="">{loadingModels ? '正在加载可用模型…' : '暂无可用模型'}</option> : models.map(name => <option key={name} value={name}>{name}</option>)}
      </NativeSelect>
      {modelError ? <div className="flex items-center gap-2"><p role="alert" className="text-sm text-destructive">{modelError}</p><Button type="button" variant="outline" size="sm" onClick={() => { setCatalog(undefined); setRetry(value => value + 1) }}>重试</Button></div> : null}
    </> : <Input id="cc-switch-model" value={model} onChange={event => { setModel(event.target.value); setSent(false) }} placeholder="留空使用 Claude 默认模型" />}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {sent ? <p role="status" className="text-sm text-muted-foreground">已请求打开 CC Switch，请在应用中确认。重复导入可能创建重复供应商。</p> : null}
    <Button type="submit" disabled={!canImport || (app === 'codex' && !importModel)}>{sent ? '重新打开 CC Switch' : '打开 CC Switch 导入'}</Button>
  </form>
}

function toImportKeys(keys: ApiKeyRecord[]): ImportKey[] {
  return keys.map(item => ({ id: String(item.id), name: item.name || '未命名密钥', key: item.viewable ? (item.raw_key ?? item.key ?? '') : '', unavailable: item.is_active === false || item.needs_group_binding === true || !item.viewable || !(item.raw_key || item.key) }))
}

function LoadImportKeys() {
  const { data, loading, error, reload } = useAsync(async () => {
    const response = await userApi.listApiKeys()
    return toImportKeys(Array.isArray(response) ? response : response.api_keys ?? response.keys ?? [])
  }, [] as ImportKey[])
  if (loading) return <p role="status">正在加载密钥…</p>
  if (error) return <div className="flex flex-col gap-3"><p role="alert">加载密钥失败，请重试。</p><Button onClick={reload}>重试</Button></div>
  if (!data.length) return <p>还没有 API 密钥，请先到「API 密钥」页面创建。</p>
  return <ImportForm keys={data} />
}
