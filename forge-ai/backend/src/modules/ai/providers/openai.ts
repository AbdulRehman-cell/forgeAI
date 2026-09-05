import axios from 'axios'
import type { AIProvider, AIMessage, AIResponse } from './base'

export class OpenAIProvider implements AIProvider {
  name = 'openai'
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async chat(messages: AIMessage[], systemPrompt?: string): Promise<AIResponse> {
    const apiMessages = messages.map((m) =>
      m.images?.length
        ? {
            role: m.role,
            content: [
              { type: 'text', text: m.content },
              ...m.images.map((url) => ({ type: 'image_url', image_url: { url } })),
            ],
          }
        : { role: m.role, content: m.content },
    )

    const payload = {
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...apiMessages,
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
