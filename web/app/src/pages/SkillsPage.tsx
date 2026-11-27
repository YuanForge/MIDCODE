import { useState, useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createHttpClient, getApiErrorMessage } from '@/lib/api/http'

const statusLabels = { pending: '待审核', approved: '已通过', rejected: '已驳回' }
type Skill = { id: number; url: string; status: keyof typeof statusLabels }
const user = createHttpClient('user')
const reviewer = createHttpClient('admin')

export default function SkillsPage({ admin = false }: { admin?: boolean }) {
  const [mine, setMine] = useState(false)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const endpoint = admin ? '/admin/skills' : mine ? '/user/skills/mine' : '/user/skills'
  const client = admin ? reviewer : user
  const [revision, refresh] = useState(0)
  const [result, setResult] = useState<{ endpoint: string; data?: Skill[]; error?: string }>()
  useEffect(() => {
    const controller = new AbortController()
    client.get<Skill[]>(endpoint, { signal: controller.signal }).then(
      data => { if (!controller.signal.aborted) setResult({ endpoint, data }) },
      error => { if (!controller.signal.aborted) setResult({ endpoint, error: getApiErrorMessage(error) }) },
    )
    return () => controller.abort()
  }, [client, endpoint, revision])
  const list = result?.endpoint === endpoint ? result : undefined

  async function save(skill?: Skill, status?: Skill['status']) {
    setBusy(true)
    setMessage('')
    try {
      if (skill) {
        await reviewer.patch('/admin/skills/' + skill.id, { status })
        setMessage('审核结果已保存')
      } else {
        await user.post('/user/skills', { url })
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
    <h1 className="text-3xl font-semibold">{admin ? 'Skills 审核' : 'Skills 市场'}</h1>
    {!admin && <form className="rounded-xl border bg-card p-5 space-y-3" onSubmit={event => { event.preventDefault(); void save() }}>
      <label htmlFor="skill-url" className="font-medium">提交你的 Skill</label>
      <div className="flex flex-wrap gap-2">
        <Input className="min-w-48 flex-1" id="skill-url" aria-label="GitHub 地址" type="url" required maxLength={1024} placeholder="https://github.com/作者/仓库" value={url} onChange={event => setUrl(event.target.value)} />
        <Button disabled={busy}>提交审核</Button>
      </div>
    </form>}
    <p role="status">{message}</p>
    <section className="rounded-xl border bg-card p-5 space-y-4">
      {admin ? <h2 className="font-semibold">待审核</h2> : <div className="flex gap-2">
        <Button variant={mine ? 'outline' : 'default'} onClick={() => setMine(false)}>已上架</Button>
        <Button variant={mine ? 'default' : 'outline'} onClick={() => setMine(true)}>我的提交</Button>
      </div>}
      {!list && <p>加载中…</p>}
      {list?.error && <p role="alert">{list.error} <button onClick={() => refresh(value => value + 1)}>重试</button></p>}
      {list?.data?.length === 0 && <p className="text-muted-foreground">{admin ? '暂无待审核的 Skill' : mine ? '你还没有提交 Skill' : '暂无已上架的 Skill'}</p>}
      {list?.data?.map(skill => <div key={skill.id} className="flex flex-wrap items-center gap-3 border-t py-3">
        <a className="flex-1 break-all underline" href={skill.url} target="_blank" rel="noopener noreferrer">{skill.url.replace('https://github.com/', '')}</a>
        {mine && <span>{statusLabels[skill.status]}</span>}
        {admin && <><Button disabled={busy} onClick={() => void save(skill, 'approved')}>通过</Button>
          <Button disabled={busy} variant="outline" onClick={() => void save(skill, 'rejected')}>驳回</Button></>}
      </div>)}
    </section>
  </main>
}
