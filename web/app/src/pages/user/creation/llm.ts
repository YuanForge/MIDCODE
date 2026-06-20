import type { CreationMode } from './constants'

type ChatContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: ChatContent }

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
  msg?: string
}

async function chat(
  model: string,
  messages: ChatMessage[],
  authHeaders: Record<string, string>
): Promise<string> {
  const resp = await fetch('/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ model, messages, stream: false }),
  })
  if (!resp.ok) {
    throw new Error((await resp.text()) || `请求失败 (${resp.status})`)
  }
  const data = (await resp.json()) as ChatCompletionResponse
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error(data.error?.message ?? data.msg ?? '模型未返回内容')
  return content.trim()
}

const OPTIMIZE_SYSTEM: Record<CreationMode, string> = {
  image:
    '你是 AI 绘画提示词专家。将用户的简单描述改写为高质量的中文图片生成提示词：' +
    '补充主体、风格、光线、镜头、画质等维度，保持简洁专业，只输出优化后的提示词本身，不要解释。',
  video:
    '你是 AI 视频生成提示词专家。将用户的简单描述改写为高质量的中文视频生成提示词：' +
    '补充画面主体、运镜方式、节奏、光线、氛围等维度，保持简洁专业，只输出优化后的提示词本身，不要解释。',
}

export async function optimizePrompt(opts: {
  mode: CreationMode
  prompt: string
  model: string
  authHeaders: Record<string, string>
}): Promise<string> {
  return chat(
    opts.model,
    [
      { role: 'system', content: OPTIMIZE_SYSTEM[opts.mode] },
      { role: 'user', content: opts.prompt },
    ],
    opts.authHeaders
  )
}

const ANALYZE_INSTRUCTION: Record<CreationMode, string> = {
  image:
    '请仔细观察图片，输出一段可直接用于 AI 重新生成同类画面的中文提示词，' +
    '涵盖主体、风格、构图、光线、色调、画质，简洁专业，只输出提示词本身。',
  video:
    '请观察这张参考图，输出一段可用于 AI 视频生成的中文提示词，' +
    '在画面主体基础上补充合理的运镜、节奏与氛围，简洁专业，只输出提示词本身。',
}

/** 解析图片 → 提示词。images 为图片 URL 或 base64 data URI 列表。 */
export async function analyzeImages(opts: {
  mode: CreationMode
  images: string[]
  model: string
  authHeaders: Record<string, string>
}): Promise<string> {
  const content: ChatContent = [
    { type: 'text', text: ANALYZE_INSTRUCTION[opts.mode] },
    ...opts.images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
  ]
  return chat(
    opts.model,
    [{ role: 'user', content }],
    opts.authHeaders
  )
}
