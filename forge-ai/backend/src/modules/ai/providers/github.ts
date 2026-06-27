import axios from 'axios'
import type { AIProvider, AIMessage, AIResponse } from './base'

export class GitHubAIProvider implements AIProvider {
  name = 'github'
  private token: string
  // GitHub AI Models endpoint
  private baseURL = 'https://models.github.ai/inference'
  private model = "gpt-4.1"  // or 'gpt-4o-mini', 'Meta-Llama-3.1-405B-Instruct', etc.

  constructor(token: string) {
    this.token = token
  }

  async chat(messages: AIMessage[], systemPrompt?: string): Promise<AIResponse> {
    const { data } = await axios.post(
      `${this.baseURL}/chat/completions`,
      {
        model: this.model,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          ...messages,
        ],
        max_tokens: 8000,
      },
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      },
    )

    return {
      content: data.choices[0].message.content,
      tokensUsed: data.usage?.total_tokens,
    }
  }
}