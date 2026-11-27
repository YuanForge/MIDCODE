import { useState, useEffect } from 'react'

import { BoxesIcon, ArrowUpRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { createHttpClient, getApiErrorMessage } from '@/lib/api/http'

const statusLabels = { pending: '待审核', approved: '已通过', rejected: '已驳回' }
type Skill = { id: number; url: string; status: keyof typeof statusLabels }
const user = createHttpClient('user')
const reviewer = createHttpClient('admin')

function SkillList({ scope, revision, busy, review }: {
  scope: 'market' | 'mine' | 'review'
  revision: number
  busy?: boolean
  review?: (skill: Skill, status: Skill['status']) => void
}) {
  const [result, setResult] = useState<{ endpoint: string; data?: Skill[]; error?: string }>()
  const client = scope === 'review' ? reviewer : user
  const endpoint = { market: '/user/skills', mine: '/user/skills/mine', review: '/admin/skills' }[scope]
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    client.get<Skill[]>(endpoint, { signal: controller.signal }).then(
      data => { if (!controller.signal.aborted) setResult({ endpoint, data }) },
      error => { if (!controller.signal.aborted) setResult({ endpoint, error: getApiErrorMessage(error) }) },
    )
    return () => controller.abort()
  }, [client, endpoint, revision, retry])
  const list = result?.endpoint === endpoint ? result : undefined

  if (!list) return <p>加载中…</p>
  if (list.error) return <p role="alert">{list.error} <Button variant="outline" onClick={() => setRetry(value => value + 1)}>重试</Button></p>
  if (!list.data?.length) return <p className="surface-dense p-6 text-sm text-muted-foreground">
    {{ market: '暂无已上架的 Skill', mine: '你还没有提交 Skill', review: '暂无待审核的 Skill' }[scope]}
  </p>

  return <ul className={scope === 'market' ? 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3' : 'grid gap-2'}>
    {list.data.map(skill => {
      const path = skill.url.replace('https://github.com/', '')
      const [owner, repo, ...location] = path.split('/')
      const parts = location.slice(2)
      if (parts.at(-1)?.toLowerCase() === 'skill.md') parts.pop()
      const title = parts.at(-1) || repo
      return <li key={skill.id} className="surface-dense flex min-w-0 flex-wrap items-center gap-3 p-4">
        <a href={skill.url} target="_blank" rel="noopener noreferrer" title={path}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:outline-ring">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl border border-glass-border bg-glass-strong"><BoxesIcon className="size-4" /></span>
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-[15px] font-semibold">{title}</strong>
            <span className="block truncate text-xs text-muted-foreground">{owner}/{repo}</span>
          </span>
          <ArrowUpRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </a>
        {scope === 'mine' && <span className="text-sm">{statusLabels[skill.status]}</span>}
        {review && <><Button disabled={busy} onClick={() => review(skill, 'approved')}>通过</Button>
          <Button disabled={busy} variant="outline" onClick={() => review(skill, 'rejected')}>驳回</Button></>}
      </li>
    })}
  </ul>
}

export default function SkillsPage({ admin = false }: { admin?: boolean }) {
  const [mine, setMine] = useState(false)
  const [url, setUrl] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [revision, refresh] = useState(0)
  async function save(skill?: Skill, status?: Skill['status']) {
    setBusy(true)
    setMessage('')
    try {
      if (skill) {
        await reviewer.patch('/admin/skills/' + skill.id, { status })
        setMessage('审核结果已保存')
      } else {
        await user.post('/user/skills', { url })
        setUploadOpen(false)
        setUrl('')
        setMine(true)
        setMessage('已提交，等待管理员审核')
      }
      refresh(value => value + 1)
    } catch (error) {
      setMessage(getApiErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return <main className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-3xl font-semibold">{admin ? 'Skills 审核' : 'Skills 市场'}</h1>
      {!admin && <div className="flex flex-wrap gap-2">
        <Dialog open={mine} onOpenChange={setMine}>
          <DialogTrigger asChild><Button variant="outline">我的提交</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>我的提交</DialogTitle>
              <DialogDescription>查看已提交的 Skills 和审核状态。</DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto"><SkillList scope="mine" revision={revision} /></div>
          </DialogContent>
        </Dialog>
        <Dialog open={uploadOpen} onOpenChange={open => {
        if (busy) return
        setUploadOpen(open)
        setMessage('')
      }}>
        <DialogTrigger asChild><Button>上传我的 Skills</Button></DialogTrigger>
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>上传我的 Skills</DialogTitle>
            <DialogDescription>提交 GitHub 地址，审核通过后即可在市场展示。</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save() }}>
            <div className="space-y-2">
              <label htmlFor="skill-url" className="font-medium">GitHub 地址</label>
              <Input id="skill-url" type="url" required maxLength={1024} placeholder="https://github.com/作者/仓库" value={url} onChange={event => setUrl(event.target.value)} />
            </div>
            {message && <p role="alert">{message}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setUploadOpen(false)}>取消</Button>
              <Button type="submit" disabled={busy}>{busy ? '提交中…' : '提交审核'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog></div>}
    </header>
    {!uploadOpen && message && <p role="status">{message}</p>}
    {admin && <h2 className="font-semibold">待审核</h2>}
    <SkillList scope={admin ? 'review' : 'market'} revision={revision} busy={busy} review={admin ? save : undefined} />
  </main>
}
