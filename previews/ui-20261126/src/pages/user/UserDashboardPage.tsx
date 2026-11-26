import { Link } from 'react-router-dom'
import { ChevronRightIcon, MegaphoneIcon, PlusIcon } from 'lucide-react'

import { CodeBlock } from '@/components/shared/CodeBlock'
import { CopyButton } from '@/components/shared/CopyButton'
import { PageHeader } from '@/components/shared/PageHeader'
import { Panel } from '@/components/shared/Panel'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAsync } from '@/hooks/use-async'
import { useSiteSettings } from '@/hooks/use-site-settings'
import { userApi, type ApiKeyRecord, type UserLog, type UserStatsResponse } from '@/lib/api/user'
import { getRoleToken } from '@/lib/auth/storage'
import { formatCredits } from '@/lib/formatters/credits'
import { formatCallDuration } from '@/lib/formatters/duration'
import { cn } from '@/lib/utils'
import { buildWeek, runwayDays, sumRequests } from '@/pages/user/dashboard/week'
import { LogStatus } from '@/pages/user/logs/LogCells'

// The steps really are a sequence for a new account, so they are numbered.
const guideSteps = [
  { title: '创建 API 密钥', text: '在「API 密钥」新建，用于接口鉴权', to: '/keys' },
  { title: '查看模型', text: '在「模型列表」获取模型 ID 与调用地址', to: '/models' },
  { title: '体验文本对话', text: '在「文本对话」在线试用聊天模型', to: '/playground' },
  { title: '体验图片生成', text: '在线试用图片生成模型', to: '/image-gen' },
  { title: '充值积分', text: '在「积分充值」选择套餐或兑换卡密', to: '/billing' },
]

const EMPTY = { balance: 0, stats: {} as UserStatsResponse, keys: [] as ApiKeyRecord[], logs: [] as UserLog[] }
const RECENT = 8

type Todo = { key: string; tone: 'warning' | 'danger'; title: string; detail: string; to: string; action: string }

/** The same first request in three clients. The key and the model are placeholders the person replaces. */
function samples(base: string) {
  return {
    curl: [
      `curl ${base}/chat/completions \\`,
      '  -H "Authorization: Bearer YOUR_API_KEY" \\',
      '  -H "Content-Type: application/json" \\',
      `  -d '{"model": "MODEL_ID", "messages": [{"role": "user", "content": "你好"}]}'`,
    ].join('\n'),
    python: [
      'from openai import OpenAI',
      '',
      `client = OpenAI(base_url="${base}", api_key="YOUR_API_KEY")`,
      'reply = client.chat.completions.create(',
      '    model="MODEL_ID",',
      '    messages=[{"role": "user", "content": "你好"}],',
      ')',
      'print(reply.choices[0].message.content)',
    ].join('\n'),
    node: [
      'import OpenAI from "openai";',
      '',
      `const client = new OpenAI({ baseURL: "${base}", apiKey: "YOUR_API_KEY" });`,
      'const reply = await client.chat.completions.create({',
      '  model: "MODEL_ID",',
      '  messages: [{ role: "user", content: "你好" }],',
      '});',
      'console.log(reply.choices[0].message.content);',
    ].join('\n'),
  }
}

function clock(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** A figure with its label under it. The number is its own element, so it can be found by its text. */
function Figure({ label, value, unit, loading, size = 'md' }: { label: string; value: string; unit?: string; loading: boolean; size?: 'sm' | 'md' }) {
  return (
    <div className='flex min-w-0 flex-col-reverse gap-0.5'>
      <dt className='truncate text-[13px] text-muted-foreground'>{label}</dt>
      <dd className='flex min-w-0 items-baseline gap-1.5'>
        {loading ? (
          <Skeleton className={size === 'md' ? 'h-8 w-20' : 'h-7 w-16'} />
        ) : (
          <>
            <span className={cn('truncate font-semibold text-foreground tabular-nums', size === 'md' ? 'text-2xl leading-8 tracking-[-0.025em]' : 'text-xl leading-7 tracking-[-0.02em]')}>{value}</span>
            {unit ? <span className='shrink-0 text-xs text-muted-foreground'>{unit}</span> : null}
          </>
        )}
      </dd>
    </div>
  )
}

/**
 * Overview. The balance is the page's one large reading and floats highest, with how long it lasts at the
 * current pace; beside it are the last seven days. Under it, things that need the person's attention appear only
 * when there are any. Then how to connect, next to the most recent calls (or the first steps, for an account that
 * has not made a call yet). A guest sees how to connect and where to sign in, and no request is made for them.
 * A failed load shows dashes, never zeros.
 */
export function UserDashboardPage() {
  const signedIn = Boolean(getRoleToken('user'))
  const { data, loading, error, reload } = useAsync(async () => {
    if (!signedIn) return EMPTY
    // The balance and the statistics are the page; keys and recent calls only add to it, so they may fail quietly.
    const [balance, stats, keys, logs] = await Promise.all([
      userApi.getBalance(),
      userApi.getStats(),
      userApi.listApiKeys().catch(() => null),
      userApi.listLogs({ page: 1, page_size: RECENT }).catch(() => null),
    ])
    const keyList = Array.isArray(keys) ? keys : (keys?.api_keys ?? keys?.keys ?? [])
    return { balance: balance.balance_credits ?? 0, stats, keys: keyList, logs: logs?.logs ?? logs?.items ?? [] }
  }, EMPTY)

  const { settings } = useSiteSettings()
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const base = `${origin}/v1`
  const code = samples(base)
  const hasContact = Boolean(settings.contactInfo || settings.qqGroupUrl || settings.wechatCsUrl)
  const failed = Boolean(error)
  const figure = (credits: number) => (failed ? '—' : formatCredits(credits))

  const week = buildWeek(data.stats)
  const weekMax = Math.max(...week.map((day) => day.value), 1)
  const weekTotal = week.reduce((sum, day) => sum + day.value, 0)
  const requests = sumRequests(data.stats)
  const requestTotal = requests.success + requests.failed
  const runway = failed ? null : runwayDays(data.balance, weekTotal)
  const runwayText =
    runway == null
      ? '当前可用，永不过期'
      : runway > 365
        ? '按近 7 天的速度，可用一年以上'
        : runway < 1
          ? '按近 7 天的速度，不够用 1 天'
          : `按近 7 天的速度，约可用 ${Math.floor(runway)} 天`

  const firstKey = data.keys.find((key) => key.is_active !== false)
  const todos: Todo[] = []
  if (signedIn && !loading && !failed) {
    for (const key of data.keys.filter((item) => item.needs_group_binding && item.is_active !== false).slice(0, 2)) {
      todos.push({ key: `key-${key.id}`, tone: 'warning', title: `密钥「${key.name || '未命名'}」还没有配置模型分组`, detail: '配置后才能用这把密钥调用模型。', to: '/keys', action: '去配置' })
    }
    const failedCalls = data.logs.filter((log) => log.status === 'error')
    if (failedCalls.length > 0) {
      todos.push({
        key: 'failed',
        tone: 'danger',
        title: `最近 ${data.logs.length} 次调用里有 ${failedCalls.length} 次失败`,
        detail: [failedCalls[0].model, failedCalls[0].error_msg].filter(Boolean).join('：') || '打开调用日志查看原因。',
        to: '/llm-logs',
        action: '查看记录',
      })
    }
    if (runway != null && runway < 3) {
      todos.push({ key: 'runway', tone: 'warning', title: '余额快用完了', detail: '按近 7 天的速度，余额不够用 3 天。', to: '/billing', action: '充值' })
    }
  }

  return (
    <>
      <PageHeader
        title='用户数据看板'
        description='账户余额、近期消耗和接入信息。'
        actions={error ? <Button variant='outline' onClick={reload}>重试</Button> : null}
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {settings.noticeTitle ? (
        <aside aria-label={settings.noticeTitle} className='glass flex gap-3 border-l-[3px] border-l-brand px-4 py-3'>
          <MegaphoneIcon aria-hidden className='mt-0.5 size-4 shrink-0 text-brand' />
          <div className='flex min-w-0 flex-col gap-0.5'>
            <p className='text-[13px] font-medium text-foreground'>{settings.noticeTitle}</p>
            {settings.noticeContent ? <p className='text-xs leading-5 whitespace-pre-wrap text-muted-foreground'>{settings.noticeContent}</p> : null}
          </div>
        </aside>
      ) : null}

      {signedIn ? (
        <section aria-label='账户余额' className='glass-raised grid min-w-0 overflow-hidden lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]'>
          <div className='flex flex-col gap-6 p-6 sm:p-7'>
            <div className='flex flex-col gap-2'>
              <span className='text-[13px] text-muted-foreground'>剩余积分</span>
              {loading ? (
                <Skeleton className='h-14 w-56' />
              ) : (
                <p className='flex flex-wrap items-baseline gap-x-2'>
                  <span className='readout text-foreground'>{figure(data.balance)}</span>
                  <span className='text-sm text-muted-foreground'>积分</span>
                </p>
              )}
              <span className='text-[13px] text-muted-foreground'>{loading ? ' ' : runwayText}</span>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Button asChild>
                <Link to='/billing'>
                  <PlusIcon data-icon='inline-start' />
                  充值积分
                </Link>
              </Button>
              <Button asChild variant='outline'>
                <Link to='/billing?tab=transactions'>查看流水</Link>
              </Button>
            </div>
            <div className='mt-auto border-t border-glass-border pt-5'>
              <dl className='grid max-w-sm grid-cols-2 gap-6'>
                <Figure size='sm' label='今日消耗' value={figure(data.stats.today_consumed ?? 0)} unit='积分' loading={loading} />
                <Figure size='sm' label='累计消耗' value={figure(data.stats.total_consumed ?? 0)} unit='积分' loading={loading} />
              </dl>
            </div>
          </div>
          <div className='flex min-w-0 flex-col gap-5 border-t border-glass-border p-6 sm:p-7 lg:border-t-0 lg:border-l'>
            <div className='flex items-center justify-between gap-3'>
              <span className='text-[13px] text-muted-foreground'>近 7 天</span>
              <Link to='/stats' className='text-[13px] font-medium text-brand underline-offset-4 hover:underline'>
                用量统计
              </Link>
            </div>
            <dl className='grid grid-cols-3 gap-4'>
              <Figure label='次调用' value={failed ? '—' : requestTotal.toLocaleString()} loading={loading} />
              <Figure
                label={requestTotal > 0 ? `次失败，占 ${((requests.failed / requestTotal) * 100).toFixed(1)}%` : '次失败'}
                value={failed ? '—' : requests.failed.toLocaleString()}
                loading={loading}
              />
              <Figure label='积分消耗' value={figure(weekTotal)} loading={loading} />
            </dl>
            <div className='mt-auto grid grid-cols-7 gap-2 sm:gap-3' role='list' aria-label='近 7 天每日消耗积分'>
              {week.map((day) => {
                const height = day.value > 0 ? Math.max(4, Math.round((day.value / weekMax) * 100)) : 0
                return (
                  <div key={day.key} role='listitem' className='group/bar flex min-w-0 flex-col justify-end gap-1.5'>
                    <div className='flex h-24 items-end justify-center border-b border-glass-border'>
                      {loading ? (
                        <Skeleton className='h-1/2 w-full rounded-t-sm rounded-b-none' />
                      ) : (
                        <div
                          title={`${day.key}：${formatCredits(day.value)} 积分`}
                          className={cn(
                            'w-full rounded-t-md transition-colors duration-140',
                            day.value === 0 ? 'h-px bg-foreground/15' : day.isToday ? 'bg-chart-1' : 'bg-foreground/12 group-hover/bar:bg-chart-1/45',
                          )}
                          style={day.value === 0 ? undefined : { height: `${height}%` }}
                        />
                      )}
                    </div>
                    <span className={cn('text-center text-[11px] tabular-nums', day.isToday ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                      {day.isToday ? '今天' : day.key}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      ) : (
        <section aria-label='登录' className='glass-raised flex flex-col gap-4 p-6 sm:p-7'>
          <div className='flex flex-col gap-1'>
            <h2 className='text-xl leading-7 font-semibold tracking-[-0.02em] text-foreground'>登录后查看余额和调用记录</h2>
            <p className='text-sm text-muted-foreground'>下面是接入方式，登录后就能创建密钥并发出第一次调用。</p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button asChild>
              <Link to='/login'>登录</Link>
            </Button>
            <Button asChild variant='outline'>
              <Link to='/register'>注册</Link>
            </Button>
          </div>
        </section>
      )}

      {todos.length > 0 ? (
        <Panel title='需要处理' meta={<span>{todos.length} 件</span>}>
          <ul className='animate-reveal'>
            {todos.map((todo) => (
              <li key={todo.key} className='flex items-center gap-3.5 border-b border-glass-border px-4 py-3 last:border-b-0'>
                <span aria-hidden className={cn('size-2 shrink-0 rounded-full bg-current', todo.tone === 'danger' ? 'text-destructive' : 'text-warning')} />
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-sm font-medium text-foreground'>{todo.title}</p>
                  <p className='truncate text-[13px] text-muted-foreground'>{todo.detail}</p>
                </div>
                <Button asChild size='sm' variant='outline'>
                  <Link to={todo.to}>{todo.action}</Link>
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <div className='grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:items-start'>
        <Panel title='接入'>
          <div className='grid grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-glass-border px-4 py-2.5 text-[13px]'>
            <span className='text-muted-foreground'>Base URL</span>
            <code className='truncate font-mono text-foreground'>{base}</code>
            <CopyButton value={base} label='复制 Base URL' successMessage='已复制 Base URL' />
          </div>
          <div className='grid grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-glass-border px-4 py-2.5 text-[13px]'>
            <span className='text-muted-foreground'>密钥</span>
            {firstKey ? (
              <span className='flex min-w-0 items-baseline gap-2'>
                <span className='truncate text-foreground'>{firstKey.name || '未命名'}</span>
                {firstKey.key_prefix ? <code className='shrink-0 font-mono text-xs text-muted-foreground'>{firstKey.key_prefix}…</code> : null}
              </span>
            ) : (
              <span className='text-muted-foreground'>{signedIn ? '还没有密钥' : '登录后创建'}</span>
            )}
            <Button asChild size='sm' variant='outline'>
              <Link to={signedIn ? '/keys' : '/login'}>{firstKey ? '管理' : signedIn ? '创建密钥' : '登录'}</Link>
            </Button>
          </div>
          <div className='flex flex-col gap-3 p-4'>
            <Tabs defaultValue='curl'>
              <TabsList>
                <TabsTrigger value='curl'>curl</TabsTrigger>
                <TabsTrigger value='python'>Python</TabsTrigger>
                <TabsTrigger value='node'>Node.js</TabsTrigger>
              </TabsList>
              <TabsContent value='curl'>
                <CodeBlock code={code.curl} copyLabel='复制示例' />
              </TabsContent>
              <TabsContent value='python'>
                <CodeBlock code={code.python} copyLabel='复制示例' />
              </TabsContent>
              <TabsContent value='node'>
                <CodeBlock code={code.node} copyLabel='复制示例' />
              </TabsContent>
            </Tabs>
            <p className='text-xs leading-5 text-muted-foreground'>把 YOUR_API_KEY 换成你的密钥，MODEL_ID 在模型列表里复制。兼容 OpenAI 协议。</p>
          </div>
        </Panel>

        {data.logs.length > 0 ? (
          <Panel
            title='最近调用'
            actions={
              <Link to='/llm-logs' className='font-medium text-brand underline-offset-4 hover:underline'>
                全部记录
              </Link>
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>模型</TableHead>
                  <TableHead className='text-right'>消耗</TableHead>
                  <TableHead className='text-right'>耗时</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.logs.map((log, index) => (
                  <TableRow key={log.id ?? index} className={cn(log.status === 'error' && 'bg-destructive/8 shadow-[inset_3px_0_0_var(--destructive)]')}>
                    <TableCell className='text-muted-foreground'>{clock(log.created_at)}</TableCell>
                    <TableCell className='max-w-56 truncate font-medium text-foreground'>{log.model ?? '—'}</TableCell>
                    <TableCell className='text-right'>{log.credits_charged != null ? formatCredits(log.credits_charged) : '—'}</TableCell>
                    <TableCell className='text-right text-muted-foreground'>{formatCallDuration(log.latency_ms) ?? '—'}</TableCell>
                    <TableCell>
                      <LogStatus status={log.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        ) : (
          <Panel title='快速开始' meta={<span>新账号按顺序完成</span>}>
            <ol>
              {guideSteps.map((step, index) => (
                <li key={step.to} data-row className='border-b border-glass-border last:border-b-0'>
                  <Link
                    to={step.to}
                    data-row-open
                    className='flex items-center gap-3 px-4 py-3 outline-none transition-colors duration-140 hover:bg-glass-strong/60 focus-visible:bg-glass-strong'
                  >
                    <span className='flex size-6 shrink-0 items-center justify-center rounded-full border border-glass-border text-xs text-muted-foreground tabular-nums'>{index + 1}</span>
                    <span className='flex min-w-0 flex-1 flex-col'>
                      <span className='text-[13px] font-medium text-foreground'>{step.title}</span>
                      <span className='truncate text-xs text-muted-foreground'>{step.text}</span>
                    </span>
                    <ChevronRightIcon aria-hidden className='size-3.5 shrink-0 text-faint' />
                  </Link>
                </li>
              ))}
            </ol>
          </Panel>
        )}
      </div>

      {hasContact ? (
        <Panel title='联系方式'>
          <div className='flex flex-wrap items-start gap-6 p-4'>
            {settings.contactInfo ? (
              <div className='flex max-w-md flex-col gap-1.5 text-[13px] text-muted-foreground'>
                {settings.contactInfo.split('\n').filter(Boolean).map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            ) : null}
            {settings.qqGroupUrl ? (
              <figure className='flex flex-col items-center gap-1.5'>
                <img src={settings.qqGroupUrl} alt='QQ 交流群' className='size-32 rounded-md border bg-white object-contain p-1.5' />
                <figcaption className='text-xs text-muted-foreground'>QQ 交流群</figcaption>
              </figure>
            ) : null}
            {settings.wechatCsUrl ? (
              <figure className='flex flex-col items-center gap-1.5'>
                <img src={settings.wechatCsUrl} alt='微信客服' className='size-32 rounded-md border bg-white object-contain p-1.5' />
                <figcaption className='text-xs text-muted-foreground'>微信客服</figcaption>
              </figure>
            ) : null}
          </div>
        </Panel>
      ) : null}
    </>
  )
}
