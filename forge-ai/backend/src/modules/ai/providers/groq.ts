import axios from 'axios'
import type { AIProvider, AIMessage, AIResponse } from './base'

// ═══ Groq — free-tier fallback behind Gemini ═══════════════
// Groq serves Llama 3.3 70B and gpt-oss variants at ~500 tok/s with a
// generous free-tier quota (30 req/min, 6k tok/min at time of writing).
// Wired in as the helper inside HybridProvider so when Gemini hits its
// rate limit, in-flight requests silently continue on Groq instead of
// stalling. Each file generation is an INDEPENDENT call, so completed
// files (index.html, about.html, …) are never regenerated — the fallback
// only picks up the ONE call that Gemini refused.
//
// OpenAI-compatible API. Model chain fails over on 429/5xx.

const BASE_URL = 'https://api.groq.com/openai/v1/chat/completions'

const DEFAULT_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'
const FALLBACK_MODELS = (process.env.GROQ_FALLBACK_MODELS ?? 'llama-3.1-70b-versatile,llama-3.1-8b-instant')
  .split(',').map((s) => s.trim()).filter(Boolean)

export class GroqProvider implements AIProvider {
  name = 'groq'
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async chat(messages: AIMessage[], systemPrompt?: string): Promise<AIResponse> {
    const apiMessages = [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ]

    const models = [...new Set([DEFAULT_MODEL, ...FALLBACK_MODELS])]
    let lastErr: any = null

    for (const model of models) {
      try {
        const { data } = await axios.post(
          BASE_URL,
          { model, messages: apiMessages, max_tokens: 8000 },
          {
            headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
            timeout: 90_000,
          },
        )
        return {
          content: data.choices[0].message.content,
          tokensUsed: data.usage?.total_tokens,
        }
      } catch (err: any) {
        const status = err.response?.status
        lastErr = err
        // 429 / 5xx / network → try next model in the chain
        if (status === 429 || (status ?? 0) >= 500 || !err.response) continue
        // Other errors (400/401/403) are not retryable across models
        throw err
      }
    }
    throw lastErr ?? new Error('Groq: all models failed')
  }
}
