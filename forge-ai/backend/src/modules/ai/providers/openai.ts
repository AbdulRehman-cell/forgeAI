import axios from 'axios'
import type { AIProvider, AIMessage, AIResponse } from './base'

export class OpenAIProvider implements AIProvider {
  name = 'openai'
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async chat(messages: AIMessage[], systemPrompt?: string): Promise<AIResponse> {
    const payload = {
      model: 'gpt-4-turbo',
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...messages,
      ],
      max_tokens: 8000,
    }

    const { data } = await axios.post('https://api.openai.com/v1/chat/completions', payload, {
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
    })

    return {
      content: data.choices[0].message.content,
      tokensUsed: data.usage?.total_tokens,
    }
  }
}
