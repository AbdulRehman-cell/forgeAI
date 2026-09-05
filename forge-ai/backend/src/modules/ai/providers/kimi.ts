import axios from 'axios'
import type { AIProvider, AIMessage, AIResponse } from './base'

// ═══ Moonshot Kimi — OpenAI-compatible, 256k context ═══════
// The premium builder engine. Kimi's huge context holds an entire site, so
// (unlike GitHub Models) it needs no long-input offload — it is always tried
// first and only hands off on failure. Rate limits fall down a model chain,
// each model having its own quota.
//
// Circuit breaker: a billing/quota/suspension error trips a short pause so we
// stop hammering a dead account and fall back to the free stack instead — the
// errors are thrown WITHOUT an axios response so HybridProvider treats them as
// recoverable and switches to its helper.

const BASE_URL = process.env.KIMI_BASE_URL ?? 'https://api.moonshot.ai/v1'

const FALLBACK_MODELS = (process.env.KIMI_FALLBACK_MODELS ?? 'kimi-k2.6')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const MAX_TOKENS = Number(process.env.KIMI_MAX_TOKENS ?? 8192)
const TEMPERATURE = Number(process.env.KIMI_TEMPERATURE ?? 0.6)
const SUSPEND_COOLDOWN_MS = Number(process.env.KIMI_SUSPEND_COOLDOWN_MS ?? 5 * 60 * 1000)

// Models the API rejected as unknown — skip for the process lifetime
const deadModels = new Set<string>()
// Set when the account is out of balance/suspended; Kimi is skipped until then
let suspendedUntil = 0

export class KimiProvider implements AIProvider {
  name = 'kimi'
  private apiKey: string
  private model: string

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey
    this.model = model ?? process.env.KIMI_MODEL ?? 'kimi-k2.7-code'
  }

  async chat(messages: AIMessage[], systemPrompt?: string): Promise<AIResponse> {
    // Circuit breaker open → fail fast (no response ⇒ hybrid falls back)
    if (Date.now() < suspendedUntil) {
      throw new Error('[kimi] paused (billing/quota) — using fallback')
    }

    const models = [...new Set([this.model, ...FALLBACK_MODELS])].filter((m) => !deadModels.has(m))
    if (!models.length) throw new Error('All configured Kimi models are unavailable')

    let lastErr: any = null
    for (const model of models) {
      try {
        return await this.request(model, messages, systemPrompt)
      } catch (err: any) {
        const status = err.response?.status
        const type = err.response?.data?.error?.type ?? ''
        const msg = err.response?.data?.error?.message ?? ''

        // Out of balance / suspended / quota — trip the breaker and fall back
        if (status === 402 || /quota|suspend|balance|insufficient/i.test(`${type} ${msg}`)) {
          suspendedUntil = Date.now() + SUSPEND_COOLDOWN_MS
          console.warn(`[kimi] account unavailable (billing/quota) — pausing ${Math.round(SUSPEND_COOLDOWN_MS / 60000)}min, using fallback`)
          throw new Error('[kimi] account unavailable — using fallback') // no response ⇒ recoverable
        }

        // Unknown model → drop from rotation
        if (status === 404 || /model/i.test(msg)) {
          console.warn(`[kimi] model "${model}" unavailable — removing from rotation`)
          deadModels.add(model)
          lastErr = err
          continue
        }

        // Rate limited / overloaded → next model has its own quota
        if (status === 429 || status === 503) {
          console.warn(`[kimi] ${model} ${status === 429 ? 'rate limited' : 'overloaded'} — trying next model`)
          lastErr = err
          continue
        }

        throw err
      }
    }
    throw lastErr ?? new Error('All Kimi models failed')
  }

  private async request(
    model: string,
    messages: AIMessage[],
    systemPrompt?: string,
  ): Promise<AIResponse> {
    // OpenAI-style multimodal: messages with images become content arrays
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

    const { data } = await axios.post(
      `${BASE_URL}/chat/completions`,
      {
        model,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          ...apiMessages,
        ],
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      },
      {
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        timeout: 300_000,
      },
    )

    // Reasoning models keep their thoughts in a separate field — take only content
    const message = data.choices?.[0]?.message ?? {}
    return {
      content: message.content ?? '',
      tokensUsed: data.usage?.total_tokens,
    }
  }
}
