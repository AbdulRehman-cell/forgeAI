export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AIResponse {
  content: string
  tokensUsed?: number
}

export interface AIProvider {
  name: string
  chat(messages: AIMessage[], systemPrompt?: string): Promise<AIResponse>
}
