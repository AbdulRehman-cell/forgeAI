import axios from 'axios'
import type { AIProvider, AIMessage, AIResponse } from './base'

export class ClaudeProvider implements AIProvider {
  name = 'claude'
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async chat(messages: AIMessage[], systemPrompt?: string): Promise<AIResponse> {
    const { data } = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-opus-4-6',
        max_tokens: 8000,
        system: systemPrompt ?? 'You are an expert software engineer helping fix code.',
        messages: messages.filter((m) => m.role !== 'system').map((m) => ({
          role: m.role,
          content: m.content,
        })),
      },
      {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
      },
    )

    return {
      content: data.content[0].text,
      tokensUsed: data.usage?.input_tokens + data.usage?.output_tokens,
    }
  }
}
