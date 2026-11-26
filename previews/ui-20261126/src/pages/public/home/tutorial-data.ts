export type LineKind = 'shell' | 'comment' | 'output' | 'plain'
export type TutorialLine = { text: string; kind: LineKind; step: number }
export type Tutorial = {
  id: 'claude' | 'codex' | 'sdk' | 'image'
  label: string
  title: string
  note: string
  steps: string[]
  endpoint: string
  ok: string
  keyLabel: string | null
  thumb: boolean
  lines: TutorialLine[]
}

type Translate = (key: string) => string

const API_KEY = 'YOUR_API_KEY'
const CHANNEL = 'CHANNEL_NAME'
const CONT = ' \\'

const line = (step: number, text: string, kind: LineKind = 'plain'): TutorialLine => ({ step, text, kind })

/**
 * The four walkthroughs on the home page. The paths are the gateway's own, the host is this site's origin and
 * `model` takes the channel name. Step texts come from i18n and mark inline code with backticks.
 */
export function buildTutorials(origin: string, siteName: string, t: Translate): Tutorial[] {
  const copy = (name: string, count: number) => ({
    title: t(`home.tut${name}Title`),
    note: t(`home.tut${name}Note`),
    steps: Array.from({ length: count }, (_, index) => t(`home.tut${name}Step${index + 1}`)),
  })
  const auth = `  -H "Authorization: Bearer ${API_KEY}"${CONT}`
  const json = `  -H "Content-Type: application/json"${CONT}`

  return [
    {
      id: 'claude',
      label: 'Claude Code',
      ...copy('Claude', 4),
      endpoint: 'POST /v1/messages',
      ok: `200 · ${t('home.tutDone')}`,
      keyLabel: t('home.tutKeyLabel'),
      thumb: false,
      lines: [
        line(1, `export ANTHROPIC_BASE_URL=${origin}`, 'shell'),
        line(2, `export ANTHROPIC_AUTH_TOKEN=${API_KEY}`, 'shell'),
        line(3, `export ANTHROPIC_MODEL=${CHANNEL}`, 'shell'),
        line(3, 'claude', 'shell'),
      ],
    },
    {
      id: 'codex',
      label: 'Codex',
      ...copy('Codex', 4),
      endpoint: 'POST /v1/responses',
      ok: `200 · ${t('home.tutDone')}`,
      keyLabel: 'MIDCODE_API_KEY',
      thumb: false,
      lines: [
        line(1, '# ~/.codex/config.toml', 'comment'),
        line(1, `model = "${CHANNEL}"`),
        line(1, 'model_provider = "midcode"'),
        line(1, ''),
        line(2, '[model_providers.midcode]'),
        line(2, `name = "${siteName}"`),
        line(2, `base_url = "${origin}/v1"`),
        line(2, 'env_key = "MIDCODE_API_KEY"'),
        line(2, 'wire_api = "responses"'),
      ],
    },
    {
      id: 'sdk',
      label: 'OpenAI SDK',
      ...copy('Sdk', 3),
      endpoint: 'POST /v1/chat/completions',
      ok: `200 · ${t('home.tutDone')}`,
      keyLabel: null,
      thumb: false,
      lines: [
        line(0, 'pip install openai', 'shell'),
        line(0, ''),
        line(1, 'from openai import OpenAI'),
        line(1, ''),
        line(1, 'client = OpenAI('),
        line(1, `    base_url="${origin}/v1",`),
        line(1, `    api_key="${API_KEY}",`),
        line(1, ')'),
        line(2, ''),
        line(2, 'r = client.chat.completions.create('),
        line(2, `    model="${CHANNEL}",`),
        line(2, '    messages=[{"role": "user", "content": "Hello"}],'),
        line(2, ')'),
        line(2, 'print(r.choices[0].message.content)'),
      ],
    },
    {
      id: 'image',
      label: t('home.capabilityImage'),
      ...copy('Image', 3),
      endpoint: 'POST /v1/images/generations',
      ok: `200 · ${t('home.tutGenerated')}`,
      keyLabel: null,
      thumb: true,
      lines: [
        line(0, `curl ${origin}/v1/images/generations${CONT}`, 'shell'),
        line(0, auth),
        line(0, json),
        line(1, `  -d '{"model": "${CHANNEL}", "prompt": "A lighthouse at dawn"}'`),
        line(2, '{ "data": [ { "url": "https://…/image.png" } ] }', 'output'),
      ],
    },
  ]
}
