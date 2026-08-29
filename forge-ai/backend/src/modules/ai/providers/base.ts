export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  /** Optional image attachments as data URLs (data:image/png;base64,…).
   *  Only set when OCR found no text in the image — text-bearing images are
   *  converted to text before reaching the provider. */
  images?: string[]
}

export interface AIResponse {
  content: string
  tokensUsed?: number
}

export interface AIProvider {
  name: string
  chat(messages: AIMessage[], systemPrompt?: string): Promise<AIResponse>
}
