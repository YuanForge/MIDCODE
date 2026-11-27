export type Message = { role: 'user' | 'assistant'; content: string }

/** The optional request parameters. Temperature and Top P are only sent when their switch is on. */
export type ChatParams = {
  systemPrompt: string
  maxTokens: string
  useTemp: boolean
  temperature: number
  useTopP: boolean
  topP: number
}

export const DEFAULT_PARAMS: ChatParams = {
  systemPrompt: '',
  maxTokens: '',
  useTemp: false,
  temperature: 0.7,
  useTopP: false,
  topP: 1,
}
