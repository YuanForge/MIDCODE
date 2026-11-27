import { useModelPreferences } from '@/hooks/use-model-preferences'
import { formatTTFT, formatTPS } from '@/lib/formatters/performance'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BlocksIcon, TerminalSquare } from 'lucide-react'

import { CodeBlock } from '@/components/shared/CodeBlock'
import { CopyButton } from '@/components/shared/CopyButton'
import { EmptyState } from '@/components/shared/EmptyState'
import { FilterRailGroup } from '@/components/shared/FilterRail'
import { ModelCards, ModelCardsSkeleton, type ModelBar, type ModelCardData } from '@/pages/user/models/ModelCards'
import { parseTokenPrice, tidyPrice } from '@/pages/user/models/price'
import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ModelSearch, ProviderChips } from '@/pages/user/models/ModelFilters'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAsync } from '@/hooks/use-async'
import { userApi, type ModelAvailability, type UserChannel } from '@/lib/api/user'
import { cn } from '@/lib/utils'

type DocMode = 'channel' | 'balance' | 'task'
type LangTab = 'curl' | 'javascript' | 'python' | 'php' | 'go' | 'java'
type SunoMode = 'inspire' | 'custom' | 'extend' | 'overpainting' | 'underpainting'
type GroupPrice = NonNullable<UserChannel['group_prices']>[number]

const typeOptions = [
  { labelKey: 'models.allTypes', value: '' },
  { labelKey: 'models.llm', value: 'llm' },
  { labelKey: 'models.image', value: 'image' },
  { labelKey: 'models.video', value: 'video' },
  { labelKey: 'models.audio', value: 'audio' },
  { labelKey: 'models.music', value: 'music' },
]

const protocolLabels: Record<string, string> = {
  openai: 'models.openaiCompatible',
  claude: 'models.claudeNative',
  gemini: 'models.geminiNative',
}

const billingTypeLabels: Record<string, string> = {
  token: 'models.tokenBilling',
  image: 'models.imageBilling',
  video: 'models.videoBilling',
  audio: 'models.audioBilling',
  music: 'models.musicBilling',
  count: 'models.countBilling',
  custom: 'models.customBilling',
}

function terminalPriceSortKey(priceDisplay?: string) {
  return Array.from(priceDisplay?.matchAll(/¥\s*([0-9]+(?:\.[0-9]+)?)/g) ?? [], (match) => Number(match[1]))
    .filter(Number.isFinite)
}

function compareTerminalPrices(left?: string, right?: string) {
  const leftPrices = terminalPriceSortKey(left)
  const rightPrices = terminalPriceSortKey(right)
  const width = Math.max(leftPrices.length, rightPrices.length, 1)
  for (let index = 0; index < width; index += 1) {
    const diff = (leftPrices[index] ?? Number.POSITIVE_INFINITY) - (rightPrices[index] ?? Number.POSITIVE_INFINITY)
    if (diff !== 0) return diff
  }
  return (left ?? '').localeCompare(right ?? '')
}

function sortGroupPricesByTerminalPrice(groups?: GroupPrice[]) {
  return [...(groups ?? [])].sort((left, right) =>
    compareTerminalPrices(left.price_display, right.price_display)
    || (left.group_name ?? '').localeCompare(right.group_name ?? '')
    || left.group_code.localeCompare(right.group_code)
    || left.group_id - right.group_id,
  )
}

function channelSummaryPrice(channel: UserChannel) {
  return sortGroupPricesByTerminalPrice(channel.group_prices)[0]?.price_display || channel.price_display || ''
}

function channelWithSortedPrices(channel: UserChannel): UserChannel {
  if (!channel.group_prices?.length) return channel
  const group_prices = sortGroupPricesByTerminalPrice(channel.group_prices)
  return { ...channel, group_prices, price_display: group_prices[0]?.price_display || channel.price_display }
}

type AvailabilityTone = 'success' | 'warning' | 'danger' | 'neutral'

function availabilityState(item: ModelAvailability | undefined, unavailable: boolean): { label: string; tone: AvailabilityTone } {
  if (unavailable) return { label: '统计暂不可用', tone: 'neutral' }
  if (!item || item.total === 0) return { label: '暂无调用数据', tone: 'neutral' }
  if (item.total < 20) return { label: '数据较少', tone: 'warning' }
  if (item.availability_percent >= 99) return { label: '正常', tone: 'success' }
  if (item.availability_percent >= 95) return { label: '降级', tone: 'warning' }
  return { label: '异常', tone: 'danger' }
}

function ledgerBars(item?: ModelAvailability): ModelBar[] {
  if (!item?.total) return []
  const recent = item.recent ?? []
  const maxLatency = Math.max(1, ...recent.map((entry) => entry.latency_ms))
  return [
    ...Array.from({ length: Math.max(0, 60 - recent.length) }, () => null),
    ...recent.map((entry) => ({
      ok: entry.status === 'ok',
      ratio: Math.max(30, Math.round((entry.latency_ms / maxLatency) * 100)),
    })),
  ]
}

function shouldUseChineseExamples(language: string) {
  return language.toLowerCase().startsWith('zh')
}

function buildChannelRequestBody(channel: UserChannel, sunoMode: SunoMode, language: string) {
  const useChinese = shouldUseChineseExamples(language)
  const model = channel.routing_model || channel.name
  if (channel.type === 'llm') {
    if (channel.protocol === 'gemini') {
      return JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: useChinese ? '你好，请介绍一下自己' : 'Hello, please introduce yourself.' }] }],
      }, null, 2)
    }
    return JSON.stringify({
      model,
      messages: [{ role: 'user', content: useChinese ? '你好，请介绍一下自己' : 'Hello, please introduce yourself.' }],
      stream: false,
    }, null, 2)
  }
  if (channel.type === 'image') {
    return JSON.stringify({
      model,
      prompt: useChinese ? '一只可爱的橘猫坐在阳光下' : 'A cute orange cat sitting in the sunlight',
      size: '1k',
      aspect_ratio: '1:1',
      n: 1,
    }, null, 2)
  }
  if (channel.type === 'video') {
    return JSON.stringify({
      model,
      prompt: useChinese ? '海浪拍打岸边，夕阳西下' : 'Ocean waves hitting the shore at sunset',
      size: '720p',
      aspect_ratio: '16:9',
      duration: '5',
    }, null, 2)
  }
  if (channel.type === 'audio') {
    return JSON.stringify({
      model,
      input: useChinese ? '你好，欢迎使用语音合成服务' : 'Hello, welcome to the speech synthesis service.',
      voice: 'alloy',
    }, null, 2)
  }
  if (channel.type === 'music') {
    if (sunoMode === 'custom') {
      return JSON.stringify({
        model,
        input_type: '20',
        prompt: useChinese
          ? '[主歌]\n周四的阳光晒脸庞\n微风轻轻吹过窗\n\n[副歌]\n周四快乐不散场\n欢声笑语满心房'
          : '[Verse]\nMorning light across my face\nA gentle breeze through the window\n\n[Chorus]\nKeep the good times rolling\nLaughter filling up the room',
        title: useChinese ? '周四快乐' : 'Bright Morning',
        tags: 'pop,female voice',
        mv_version: 'chirp-v5',
        make_instrumental: false,
      }, null, 2)
    }
    if (sunoMode === 'extend') {
      return JSON.stringify({
        model,
        input_type: '20',
        prompt: useChinese
          ? '[Verse 1]\n小狗汪汪叫\n尾巴甩甩跳\n\n[Chorus]\n汪汪汪谁在听\n汪汪汪快乐行'
          : '[Verse 1]\nCity lights are fading\nFootsteps moving with the rain\n\n[Chorus]\nSing it out, keep on dreaming\nEvery night can start again',
        title: useChinese ? '为你歌唱' : 'Sing for You',
        tags: '',
        mv_version: 'chirp-v5',
        make_instrumental: false,
        continue_clip_id: 'https://cdn1.suno.ai/7c395650-62f2-4c4f-8b68-cf55b874c96c.mp3',
        continue_at: '27',
      }, null, 2)
    }
    if (sunoMode === 'overpainting') {
      return JSON.stringify({
        model,
        input_type: '20',
        prompt: '[Verse 1]\nUsah lepas kau pergi',
        tags: 'pop,female voice',
        title: 'Hi, melancholic',
        task: 'overpainting',
        metadata_params: {
          overpainting_clip_id: 'https://cdn1.suno.ai/21ae9c64-86ab-435a-b810-ed62727caf0a.mp3',
          overpainting_start_s: 0,
          overpainting_end_s: 57.9,
        },
      }, null, 2)
    }
    if (sunoMode === 'underpainting') {
      return JSON.stringify({
        model,
        input_type: '20',
        prompt: '',
        tags: 'pop,female voice',
        title: 'Hi, melancholic',
        task: 'underpainting',
        make_instrumental: true,
        metadata_params: {
          underpainting_clip_id: 'https://cdn1.suno.ai/21ae9c64-86ab-435a-b810-ed62727caf0a.mp3',
          underpainting_start_s: 0,
          underpainting_end_s: 57.9,
        },
      }, null, 2)
    }
    return JSON.stringify({
      model,
      input_type: '10',
      gpt_description_prompt: useChinese
        ? '轻快的爵士乐，适合咖啡馆氛围，女声演唱'
        : 'Light jazz for a warm cafe atmosphere, female vocal',
      mv_version: 'chirp-v5',
      make_instrumental: false,
    }, null, 2)
  }
  return JSON.stringify({ model, prompt: '...' }, null, 2)
}

function getChannelEndpoint(channel: UserChannel) {
  const endpointMap: Record<string, string> = {
    llm: '/v1/chat/completions',
    image: '/v1/image',
    video: '/v1/video',
    audio: '/v1/audio',
    music: '/v1/music',
  }
  if (channel.type === 'llm' && channel.protocol === 'gemini') {
    const model = channel.routing_model || channel.name
    return `/v1beta/models/${model}:generateContent`
  }
  return endpointMap[channel.type ?? 'llm'] || '/v1/chat/completions'
}

function getChannelCode(channel: UserChannel, lang: LangTab, sunoMode: SunoMode, language: string) {
  const origin = window.location.origin
  const endpoint = getChannelEndpoint(channel)
  const body = buildChannelRequestBody(channel, sunoMode, language)
  if (lang === 'curl') {
    return `curl -X POST "${origin}${endpoint}" \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -d '${body}'`
  }
  if (lang === 'javascript') {
    return `const response = await fetch("${origin}${endpoint}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
  },
  body: JSON.stringify(${body})
});

console.log(await response.json());`
  }
  if (lang === 'python') {
    return `import requests\nimport json\n\nurl = "${origin}${endpoint}"\nheaders = {\n    "Authorization": "Bearer YOUR_API_KEY",\n    "Content-Type": "application/json"\n}\nbody = json.loads('''${body}''')\n\nresponse = requests.post(url, headers=headers, json=body)\nprint(response.json())`
  }
  if (lang === 'php') {
    const safeBody = body.replace(/'/g, "\\'")
    return `<?php\n$url = "${origin}${endpoint}";\n$body = '${safeBody}';\n\n$ch = curl_init($url);\ncurl_setopt_array($ch, [\n    CURLOPT_RETURNTRANSFER => true,\n    CURLOPT_POST           => true,\n    CURLOPT_HTTPHEADER     => [\n        'Authorization: Bearer YOUR_API_KEY',\n        'Content-Type: application/json',\n    ],\n    CURLOPT_POSTFIELDS     => $body,\n]);\n\n$response = curl_exec($ch);\ncurl_close($ch);\necho $response;`
  }
  if (lang === 'go') {
    return `package main\n\nimport (\n\t"bytes"\n\t"fmt"\n\t"io"\n\t"net/http"\n)\n\nfunc main() {\n\tbody := []byte(\`${body}\`)\n\n\treq, _ := http.NewRequest("POST", "${origin}${endpoint}", bytes.NewBuffer(body))\n\treq.Header.Set("Authorization", "Bearer YOUR_API_KEY")\n\treq.Header.Set("Content-Type", "application/json")\n\n\tresp, _ := (&http.Client{}).Do(req)\n\tdefer resp.Body.Close()\n\tdata, _ := io.ReadAll(resp.Body)\n\tfmt.Println(string(data))\n}`
  }
  const escapedBody = body.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
  return `import java.net.http.*;\nimport java.net.URI;\n\npublic class Main {\n    public static void main(String[] args) throws Exception {\n        String body = "${escapedBody}";\n\n        var request = HttpRequest.newBuilder()\n            .uri(URI.create("${origin}${endpoint}"))\n            .header("Authorization", "Bearer YOUR_API_KEY")\n            .header("Content-Type", "application/json")\n            .POST(HttpRequest.BodyPublishers.ofString(body))\n            .build();\n\n        var response = HttpClient.newHttpClient()\n            .send(request, HttpResponse.BodyHandlers.ofString());\n        System.out.println(response.body());\n    }\n}`
}

function getBalanceCode(lang: LangTab) {
  const origin = window.location.origin
  if (lang === 'curl') return `curl -X GET "${origin}/user/balance" \\\n  -H "Authorization: Bearer YOUR_API_KEY"`
  if (lang === 'javascript') return `const response = await fetch("${origin}/user/balance", {
  headers: { "Authorization": "Bearer YOUR_API_KEY" }
});

console.log(await response.json());`
  if (lang === 'python') return `import requests\n\nurl = "${origin}/user/balance"\nheaders = {"Authorization": "Bearer YOUR_API_KEY"}\n\nresponse = requests.get(url, headers=headers)\nprint(response.json())`
  if (lang === 'php') return `<?php\n$url = "${origin}/user/balance";\n\n$ch = curl_init($url);\ncurl_setopt_array($ch, [\n    CURLOPT_RETURNTRANSFER => true,\n    CURLOPT_HTTPHEADER     => ['Authorization: Bearer YOUR_API_KEY'],\n]);\n\necho curl_exec($ch);\ncurl_close($ch);`
  if (lang === 'go') return `package main\n\nimport (\n\t"fmt"\n\t"io"\n\t"net/http"\n)\n\nfunc main() {\n\treq, _ := http.NewRequest("GET", "${origin}/user/balance", nil)\n\treq.Header.Set("Authorization", "Bearer YOUR_API_KEY")\n\n\tresp, _ := (&http.Client{}).Do(req)\n\tdefer resp.Body.Close()\n\tdata, _ := io.ReadAll(resp.Body)\n\tfmt.Println(string(data))\n}`
  return `import java.net.http.*;\nimport java.net.URI;\n\npublic class Main {\n    public static void main(String[] args) throws Exception {\n        var request = HttpRequest.newBuilder()\n            .uri(URI.create("${origin}/user/balance"))\n            .header("Authorization", "Bearer YOUR_API_KEY")\n            .GET()\n            .build();\n\n        var response = HttpClient.newHttpClient()\n            .send(request, HttpResponse.BodyHandlers.ofString());\n        System.out.println(response.body());\n    }\n}`
}

function getTaskCode(lang: LangTab) {
  const origin = window.location.origin
  if (lang === 'curl') return `curl -X GET "${origin}/v1/tasks/YOUR_TASK_ID" \\\n  -H "Authorization: Bearer YOUR_API_KEY"`
  if (lang === 'javascript') return `const response = await fetch("${origin}/v1/tasks/YOUR_TASK_ID", {
  headers: { "Authorization": "Bearer YOUR_API_KEY" }
});

console.log(await response.json());`
  if (lang === 'python') return `import requests\n\nurl = "${origin}/v1/tasks/YOUR_TASK_ID"\nheaders = {"Authorization": "Bearer YOUR_API_KEY"}\n\nresponse = requests.get(url, headers=headers)\nprint(response.json())`
  if (lang === 'php') return `<?php\n$url = "${origin}/v1/tasks/YOUR_TASK_ID";\n\n$ch = curl_init($url);\ncurl_setopt_array($ch, [\n    CURLOPT_RETURNTRANSFER => true,\n    CURLOPT_HTTPHEADER     => ['Authorization: Bearer YOUR_API_KEY'],\n]);\n\necho curl_exec($ch);\ncurl_close($ch);`
  if (lang === 'go') return `package main\n\nimport (\n\t"fmt"\n\t"io"\n\t"net/http"\n)\n\nfunc main() {\n\treq, _ := http.NewRequest("GET", "${origin}/v1/tasks/YOUR_TASK_ID", nil)\n\treq.Header.Set("Authorization", "Bearer YOUR_API_KEY")\n\n\tresp, _ := (&http.Client{}).Do(req)\n\tdefer resp.Body.Close()\n\tdata, _ := io.ReadAll(resp.Body)\n\tfmt.Println(string(data))\n}`
  return `import java.net.http.*;\nimport java.net.URI;\n\npublic class Main {\n    public static void main(String[] args) throws Exception {\n        var request = HttpRequest.newBuilder()\n            .uri(URI.create("${origin}/v1/tasks/YOUR_TASK_ID"))\n            .header("Authorization", "Bearer YOUR_API_KEY")\n            .GET()\n            .build();\n\n        var response = HttpClient.newHttpClient()\n            .send(request, HttpResponse.BodyHandlers.ofString());\n        System.out.println(response.body());\n    }\n}`
}

function getChannelResponse(channel: UserChannel, language: string) {
  if (channel.type === 'llm') {
    return JSON.stringify({
      id: 'chatcmpl-abc123',
      object: 'chat.completion',
      model: channel.routing_model || channel.name,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: shouldUseChineseExamples(language)
            ? '你好！我是一个人工智能助手，很高兴认识你。请问有什么我可以帮助你的吗？'
            : 'Hello! I am an AI assistant. Nice to meet you. How can I help?',
        },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 },
    }, null, 2)
  }
  return JSON.stringify({ task_id: 'task_abc1234xyz', status: 'pending' }, null, 2)
}

function EndpointRow({ method, path, copyValue, copyLabel, copiedLabel }: { method: 'GET' | 'POST'; path: string; copyValue: string; copyLabel: string; copiedLabel: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-glass-border bg-glass-strong/50 py-1 pr-1 pl-1.5">
      <span className={cn(
        'rounded-md px-2 py-1 font-mono text-xs font-semibold',
        method === 'POST' ? 'bg-primary text-primary-foreground' : 'bg-success/15 text-success',
      )}>
        {method}
      </span>
      <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground">{path}</code>
      <CopyButton value={copyValue} label={copyLabel} copiedLabel={copiedLabel} />
    </div>
  )
}

function DocSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

export function UserModelsPage() {
  const { i18n, t } = useTranslation()
  const { data, loading, error, reload } = useAsync(async () => {
    const [response, availability] = await Promise.all([
      userApi.listChannels(),
      userApi.getModelAvailability().catch(() => null),
    ])
    return {
      channels: Array.isArray(response) ? response : response.channels ?? [],
      availability: availability?.models ?? null,
    }
  }, { channels: [] as UserChannel[], availability: null as ModelAvailability[] | null })
  const prefs = useModelPreferences()
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const selectedModel = (channel: UserChannel) => channel.routing_model || channel.model || channel.name || ''
  const channels = data.channels
  const displayChannels = useMemo(() => channels.map(channelWithSortedPrices), [channels])
  const availabilityByModel = useMemo(
    () => new Map((data.availability ?? []).map((item) => [item.routing_model, item])),
    [data.availability],
  )

  const [filterType, setFilterType] = useState('')
  const [filterName, setFilterName] = useState('')
  const [filterProtocol, setFilterProtocol] = useState('')
  const [filterProvider, setFilterProvider] = useState('')
  const [docVisible, setDocVisible] = useState(false)
  const [docMode, setDocMode] = useState<DocMode>('channel')
  const [docChannel, setDocChannel] = useState<UserChannel | null>(null)
  const [langTab, setLangTab] = useState<LangTab>('curl')
  const [sunoMode, setSunoMode] = useState<SunoMode>('inspire')

  const protocolOptions = useMemo(
    () => Array.from(new Set(displayChannels.map((channel) => channel.protocol || 'openai'))),
    [displayChannels],
  )

  const providerOptions = useMemo(() => {
    const providers = new Map<string, string>()
    displayChannels.forEach((channel) => {
      const provider = channel.model_provider?.trim()
      if (!provider) return

      const iconUrl = channel.icon_url?.trim() || ''
      if (!providers.has(provider) || (!providers.get(provider) && iconUrl)) {
        providers.set(provider, iconUrl)
      }
    })

    return Array.from(providers, ([name, iconUrl]) => ({ name, iconUrl })).sort((left, right) =>
      left.name.localeCompare(right.name),
    )
  }, [displayChannels])

  const availableTypeOptions = useMemo(() => {
    const presentTypes = new Set(displayChannels.map((c) => c.type ?? ''))
    return typeOptions.filter((opt) => opt.value === '' || presentTypes.has(opt.value))
  }, [displayChannels])

  const filteredChannels = useMemo(() => {
    return displayChannels.filter((channel) => {
      if (favoritesOnly && !prefs.preferences.get(selectedModel(channel))?.favorite) return false
      if (filterType && channel.type !== filterType) return false
      if (filterProtocol && (channel.protocol || 'openai') !== filterProtocol) return false
      if (filterProvider && channel.model_provider?.trim() !== filterProvider) return false
      if (!filterName) return true

      const keyword = filterName.toLowerCase()
      return [channel.name, channel.routing_model, channel.model_provider, channel.description]
        .some((value) => value?.toLowerCase().includes(keyword))
    }).sort((a,b) => Number(!!prefs.preferences.get(selectedModel(b))?.pinned) - Number(!!prefs.preferences.get(selectedModel(a))?.pinned))
  }, [prefs.preferences, favoritesOnly, displayChannels, filterName, filterProtocol, filterProvider, filterType])

  function openDoc(channel: UserChannel) {
    setDocChannel(channel)
    setDocMode('channel')
    setLangTab('curl')
    setSunoMode('inspire')
    setDocVisible(true)
  }

  function openBalanceDocs() {
    setDocMode('balance')
    setLangTab('curl')
    setDocVisible(true)
  }

  function openTaskDocs() {
    setDocMode('task')
    setLangTab('curl')
    setDocVisible(true)
  }

  function getProtocolLabel(protocol: string) {
    const key = protocolLabels[protocol]
    return key ? t(key) : protocol
  }

  function getBillingTypeLabel(billingType?: string) {
    if (!billingType) return '—'
    const key = billingTypeLabels[billingType]
    return key ? t(key) : billingType
  }

  const docTitle = docMode === 'balance' ? t('models.balanceTitle') : docMode === 'task' ? t('models.taskTitle') : docChannel?.name
  const docMeta = docMode === 'channel' && docChannel
    ? [docChannel.model_provider, getProtocolLabel(docChannel.protocol || 'openai'), getBillingTypeLabel(docChannel.billing_type)].filter((part) => part && part !== '—').join(' · ')
    : 'GET'

  const langLabels: Record<LangTab, string> = { curl: 'cURL', javascript: 'JavaScript', python: 'Python', php: 'PHP', go: 'Go', java: 'Java' }

  const languageTabs = (
    <Tabs value={langTab} onValueChange={(value) => setLangTab(value as LangTab)}>
      <TabsList variant="line" className="w-full justify-start overflow-x-auto sm:w-auto">
        <TabsTrigger value="curl">cURL</TabsTrigger>
        <TabsTrigger value="javascript">JavaScript</TabsTrigger>
        <TabsTrigger value="python">Python</TabsTrigger>
        <TabsTrigger value="php">PHP</TabsTrigger>
        <TabsTrigger value="go">Go</TabsTrigger>
        <TabsTrigger value="java">Java</TabsTrigger>
      </TabsList>
    </Tabs>
  )

  const typeRail = availableTypeOptions.map((option) => ({
    value: option.value,
    label: t(option.labelKey),
    count: option.value
      ? displayChannels.filter((channel) => channel.type === option.value).length
      : displayChannels.length,
  }))
  const protocolRail = [
    { value: '', label: t('common.all') },
    ...protocolOptions.map((protocol) => ({
      value: protocol,
      label: getProtocolLabel(protocol),
      count: displayChannels.filter((channel) => (channel.protocol || 'openai') === protocol).length,
    })),
  ]

  const rows: ModelCardData[] = filteredChannels.map((channel) => {
    const modelId = channel.routing_model || channel.model || channel.name || ''
    const item = availabilityByModel.get(modelId)
    const priceLines = channelSummaryPrice(channel).split('\n').filter(Boolean).map(tidyPrice)
    const tokenPrice = priceLines.length ? parseTokenPrice(priceLines[0]) : null
    return {
      key: channel.routing_model || channel.name || modelId,
      name: channel.name || modelId,
      modelId,
      iconUrl: channel.icon_url || undefined,
      initial: (channel.model_provider || channel.name || '?').charAt(0).toUpperCase(),
      provider: channel.model_provider || '',
      tags: [
        getProtocolLabel(channel.protocol || 'openai'),
        channel.billing_type ? getBillingTypeLabel(channel.billing_type) : '',
      ].filter(Boolean),
      price: tokenPrice,
      priceLines: tokenPrice ? priceLines.slice(1) : priceLines,
      priceFallback: t('models.meteredBilling'),
      status: availabilityState(item, data.availability === null),
      readings: item?.total
        ? [
            { label: t('models.successRate', { defaultValue: '成功率' }), value: `${item.availability_percent.toFixed(2)}%` },
            { label: t('models.requestCount', { defaultValue: '7 天请求' }), value: `${item.total.toLocaleString()} 次` },
            { label: 'TTFT', value: formatTTFT(item.ttft_ms) },
            { label: 'TPS', value: formatTPS(item.tps) },
            ...(item.p50_latency_ms ? [{ label: 'P50', value: `${item.p50_latency_ms}ms` }] : []),
          ]
        : [],
      bars: ledgerBars(item),
      barsLabel: item?.total ? `最近 60 次调用，${item.success ?? 0} 次成功` : undefined,
      onOpen: () => openDoc(channel),
    }
  })

  return (
    <>
      <PageHeader
        title={t('models.title')}
        description={t('models.description')}
        actions={
          <>
            <Button variant="outline" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(!favoritesOnly)}>只看收藏</Button>
            {prefs.error && <Button onClick={prefs.retry}>重新加载模型偏好</Button>}
            {error ? <Button variant="outline" onClick={reload}>{t('common.retry')}</Button> : null}
            <Button variant="outline" onClick={openBalanceDocs} className="hidden sm:inline-flex">
              <TerminalSquare data-icon="inline-start" />
              {t('models.balanceApi')}
            </Button>
            <Button variant="outline" onClick={openTaskDocs} className="hidden sm:inline-flex">
              <TerminalSquare data-icon="inline-start" />
              {t('models.taskApi')}
            </Button>
          </>
        }
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="glass flex flex-col gap-3 p-4">
        <ModelSearch
          value={filterName}
          onChange={setFilterName}
          placeholder={t('models.searchPlaceholder')}
          summary={t('models.modelCount', { count: filteredChannels.length })}
        />
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <FilterRailGroup
              inline
              title={t('models.type', { defaultValue: '类型' })}
              value={filterType}
              options={typeRail}
              onChange={setFilterType}
            />
            {protocolOptions.length > 1 ? (
              <FilterRailGroup
                inline
                title={t('models.protocol')}
                value={filterProtocol}
                options={protocolRail}
                onChange={setFilterProtocol}
              />
            ) : null}
          </div>
          <ProviderChips
            title={t('models.provider')}
            allLabel={t('common.all')}
            value={filterProvider}
            options={providerOptions}
            onChange={setFilterProvider}
          />
        </div>
      </div>

      {loading ? (
        <ModelCardsSkeleton />
      ) : filteredChannels.length === 0 ? (
        <EmptyState
          icon={<BlocksIcon />}
          title={t('models.emptyTitle')}
          description={t('models.emptyDescription')}
        />
      ) : (
        <ModelCards
          models={rows}
          labels={{
            copyId: t('models.modelId'),
            copiedId: t('models.copiedModelId'),
            input: t('models.inputPerMillion', { defaultValue: '输入 / 1M' }),
            output: t('models.outputPerMillion', { defaultValue: '输出 / 1M' }),
          }}
        />
      )}

      <Sheet open={docVisible} onOpenChange={setDocVisible}>
        <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-4xl">
          <SheetHeader className="shrink-0 border-b px-6 py-5">
            <SheetTitle className="text-lg">{docTitle}</SheetTitle>
            <SheetDescription>{docMeta}</SheetDescription>
            {docMode === 'channel' && docChannel && (
              <div className="flex gap-2">
                {(['favorite', 'pinned'] as const).map(field => {
                  const id = selectedModel(docChannel)
                  const active = !!prefs.preferences.get(id)?.[field]
                  const label = field === 'favorite' ? '收藏' : '置顶'
                  return <Button key={field} variant="outline" disabled={prefs.disabled(id)} aria-pressed={active} onClick={() => void prefs.toggle(id, field)}>{active ? '取消' : ''}{label}</Button>
                })}
              </div>
            )}
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col gap-7 px-6 py-6">
              {docMode === 'balance' ? (
                <>
                  <EndpointRow method="GET" path="/user/balance" copyValue={`GET ${window.location.origin}/user/balance`} copyLabel={t('common.copy')} copiedLabel={t('common.copied')} />
                  <p className="text-sm leading-relaxed text-muted-foreground">{t('models.balanceDescription')}</p>
                  <DocSection title={t('models.requestHeaders')}>
                    <CodeBlock code="Authorization: Bearer YOUR_API_KEY" copyLabel={t('common.copyHeaders')} />
                  </DocSection>
                  <DocSection title={t('models.callExample')} action={languageTabs}>
                    <CodeBlock code={getBalanceCode(langTab)} title={langLabels[langTab]} copyLabel={t('common.copyCode')} wrap bodyClassName="min-h-[140px]" />
                  </DocSection>
                  <DocSection title={t('models.responseExample')}>
                    <CodeBlock code={JSON.stringify({ balance_cny: 1.971573 }, null, 2)} copyable={false} />
                  </DocSection>
                </>
              ) : null}

              {docMode === 'task' ? (
                <>
                  <EndpointRow method="GET" path="/v1/tasks/{id}" copyValue={`${window.location.origin}/v1/tasks/YOUR_TASK_ID`} copyLabel={t('common.copy')} copiedLabel={t('common.copied')} />
                  <p className="text-sm leading-relaxed text-muted-foreground">{t('models.taskDescription')}</p>
                  <DocSection title={t('models.callExample')} action={languageTabs}>
                    <CodeBlock code={getTaskCode(langTab)} title={langLabels[langTab]} copyLabel={t('common.copyCode')} wrap bodyClassName="min-h-[140px]" />
                  </DocSection>
                  <DocSection title={t('models.responseExample')}>
                    <CodeBlock code={JSON.stringify({ task_id: '12345', status: 1, code: 200, msg: 'success', url: '', credits_charged: 3600 }, null, 2)} copyable={false} />
                  </DocSection>
                </>
              ) : null}

              {docMode === 'channel' && docChannel ? (
                <>
                  <EndpointRow
                    method="POST"
                    path={getChannelEndpoint(docChannel)}
                    copyValue={`${window.location.origin}${getChannelEndpoint(docChannel)}`}
                    copyLabel={t('common.copy')}
                    copiedLabel={t('common.copied')}
                  />

                  <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <dt className="text-xs text-muted-foreground">{t('models.modelId')}</dt>
                      <dd className="flex items-center gap-1">
                        <code className="font-mono text-sm font-medium text-foreground">{docChannel.routing_model || docChannel.name}</code>
                        <CopyButton value={docChannel.routing_model || docChannel.name || ''} label={t('models.modelId')} successMessage={t('models.copiedModelId')} />
                      </dd>
                    </div>
                    <div className="flex flex-col gap-1">
                      <dt className="text-xs text-muted-foreground">{t('models.protocol')}</dt>
                      <dd className="text-sm font-medium">{getProtocolLabel(docChannel.protocol || 'openai')}</dd>
                    </div>
                    <div className="flex flex-col gap-1">
                      <dt className="text-xs text-muted-foreground">{t('models.provider')}</dt>
                      <dd className="text-sm font-medium">{docChannel.model_provider || '—'}</dd>
                    </div>
                    <div className="flex flex-col gap-1">
                      <dt className="text-xs text-muted-foreground">{t('models.billingType')}</dt>
                      <dd className="text-sm font-medium">{getBillingTypeLabel(docChannel.billing_type)}</dd>
                    </div>
                  </dl>

                  {docChannel.description ? (
                    <p className="-mt-2 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{docChannel.description}</p>
                  ) : null}

                  <DocSection title="模型分组价格">
                    {docChannel.group_prices?.length ? (
                      <div className="divide-y divide-glass-border overflow-hidden rounded-lg border border-glass-border">
                        {docChannel.group_prices.map((group) => (
                          <div key={group.group_id} className="flex flex-col gap-3 px-4 py-3.5">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 items-baseline gap-2">
                                <span className="truncate text-sm font-medium">{group.group_name}</span>
                                <span className="font-mono text-xs text-muted-foreground">{group.group_code}</span>
                              </div>
                              <Badge variant="secondary">普通价</Badge>
                            </div>
                            <div className="text-sm whitespace-pre-wrap tabular-nums">{group.price_display || t('models.defaultPriceEmpty')}</div>
                            {group.vip_prices?.length ? (
                              <div className="flex flex-col gap-2 rounded-md bg-glass-strong/60 px-3 py-2.5">
                                {group.vip_prices.map((vip) => (
                                  <div key={vip.code} className="grid gap-1 sm:grid-cols-[10rem_1fr]">
                                    <div className="text-[13px]">
                                      <span className="font-medium">{vip.name}</span>
                                      <span className="ml-2 font-mono text-xs text-muted-foreground">{vip.code}</span>
                                    </div>
                                    <div className="text-[13px] whitespace-pre-wrap text-accent-foreground tabular-nums">{vip.price_display || t('models.defaultPriceEmpty')}</div>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-glass-border px-4 py-3.5 text-sm whitespace-pre-wrap tabular-nums">{docChannel.price_display || t('models.defaultPriceEmpty')}</div>
                    )}
                  </DocSection>

                  {docChannel.type === 'music' ? (
                    <Tabs value={sunoMode} onValueChange={(value) => setSunoMode(value as SunoMode)}>
                      <TabsList className="grid h-auto! w-full grid-cols-5">
                        <TabsTrigger value="inspire" className="h-8 px-1 text-xs">{t('models.inspireMode')}</TabsTrigger>
                        <TabsTrigger value="custom" className="h-8 px-1 text-xs">{t('models.customMode')}</TabsTrigger>
                        <TabsTrigger value="extend" className="h-8 px-1 text-xs">{t('models.extendMode')}</TabsTrigger>
                        <TabsTrigger value="overpainting" className="h-8 px-1 text-xs">{t('models.overpaintingMode')}</TabsTrigger>
                        <TabsTrigger value="underpainting" className="h-8 px-1 text-xs">{t('models.underpaintingMode')}</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  ) : null}

                  <DocSection title={t('models.callExample')} action={languageTabs}>
                    <CodeBlock code={getChannelCode(docChannel, langTab, sunoMode, i18n.language)} title={langLabels[langTab]} copyLabel={t('common.copyCode')} wrap bodyClassName="min-h-[140px]" />
                  </DocSection>

                  <DocSection title={t('models.responseExample')}>
                    <CodeBlock code={getChannelResponse(docChannel, i18n.language)} copyable={false} />
                  </DocSection>
                </>
              ) : null}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
