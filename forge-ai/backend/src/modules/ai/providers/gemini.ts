import axios from 'axios'
import type { AIProvider, AIMessage, AIResponse } from './base'

// ═══ Google Gemini — the long-context / long-output helper ═════
// Huge context window and tens of thousands of output tokens per reply, so it
// carries the loads the free GitHub Models tier can't: very long histories,
// whole-site generation, and replies that would truncate elsewhere.
//
// When a reply DOES hit the output cap (finishReason MAX_TOKENS), the provider
// automatically asks the model to continue from the exact cut point and
// stitches the parts together — callers always receive one complete answer,
// nothing is ever regenerated from scratch.
//
// Rate limits (free tier is per model) fall down a model chain, each model
// having its own quota.

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

const FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS ?? 'gemini-2.0-flash,gemini-1.5-flash,gemini-flash-latest,gemini-1.5-flash-8b')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS ?? 32_768)
const MAX_CONTINUATIONS = 3

// Thinking is OFF by default: thought tokens count against maxOutputTokens
// (starving long file outputs) and reasoning text can leak into replies,
// corrupting generated files. Set GEMINI_THINKING_BUDGET to re-enable.
const THINKING_BUDGET = Number(process.env.GEMINI_THINKING_BUDGET ?? 0)

const CONTINUE_PROMPT =
  'Your previous reply was cut off by the output limit. Continue EXACTLY from the character where it stopped — do not repeat anything already sent, do not restart, no preamble, no code fences. Output the raw continuation only.'

// Models the API rejected as unknown/unsupported — skip for process lifetime
const deadModels = new Set<string>()

// Same transient-network detection as the Claude provider: TLS handshake
// dies before any HTTP status. Retry-worthy; anything with an HTTP response
// is not.
const NETWORK_RETRY_CODES = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'ENOTFOUND', 'EPIPE',
  'ERR_SOCKET_DISCONNECTED_BEFORE_SECURE_TLS_CONNECTION',
])
function isTransientNetworkError(err: any): boolean {
  if (err?.response) return false
  if (err?.code && NETWORK_RETRY_CODES.has(err.code)) return true
  const msg = String(err?.message ?? '').toLowerCase()
  return /socket|network|tls|reset|hang up|handshake|econnreset|etimedout/.test(msg)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface GenResult {
  text: string
  finishReason?: string
  totalTokens?: number
}

function toContent(m: AIMessage) {
  const parts: any[] = [{ text: m.content }]
  for (const url of m.images ?? []) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(url)
    if (match) parts.push({ inline_data: { mime_type: match[1], data: match[2] } })
  }
  // Gemini only knows "user" and "model" roles; system content rides as user
  return { role: m.role === 'assistant' ? 'model' : 'user', parts }
}

export class GeminiProvider implements AIProvider {
  name = 'gemini'
  private apiKey: string
  private model: string

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey
    this.model = model ?? process.env.GEMINI_MODEL ?? 'gemini-2.0-flash'
  }

  async chat(messages: AIMessage[], systemPrompt?: string): Promise<AIResponse> {
    const contents = messages.map(toContent)
    const models = [...new Set([this.model, ...FALLBACK_MODELS])].filter((m) => !deadModels.has(m))
    if (!models.length) throw new Error('All configured Gemini models are unavailable')

    let lastErr: any = null
    for (const model of models) {
      // Inner loop attempts (per model):
      //   attempt 0: send with thinkingConfig
      //   attempt 1: retry without thinkingConfig (some models 400 on budget=0)
      //   attempts 2-5: 503 backoff slots (5s, 10s, 20s, 40s)
      for (let attempt = 0; attempt < 6; attempt++) {
        const sendThinking = attempt === 0
        try {
          return await this.generateWithContinuation(model, contents, systemPrompt, sendThinking)
        } catch (err: any) {
          const status = err.response?.status
          lastErr = err
          // 410 Gone = Google retired this model version (e.g. gemini-1.5-flash
          // hitting its EOL date). 404 = never existed. Both are permanent for
          // this process — drop it from the rotation and try the next model.
          if (status === 404 || status === 410) {
            console.warn(`[gemini] model "${model}" ${status === 410 ? 'retired (410 Gone)' : 'unknown (404)'} — removing from rotation`)
            deadModels.add(model)
            break // rotate to the next model
          }
          // Rate limited → next model has its own quota
          if (status === 429) {
            console.warn(`[gemini] ${model} rate limited — trying next model`)
            break // rotate to the next model
          }
          // 503 overloaded — retry with exponential backoff before rotating.
          // Paid tier: 5 attempts (0s,5s,10s,20s,40s = ~75s max per model).
          if (status === 503) {
            const maxRetries = 4
            if (attempt < maxRetries) {
              const delay = Math.min(5000 * Math.pow(2, attempt), 40_000)
              console.warn(`[gemini] ${model} overloaded (503) — retry in ${delay}ms`)
              await sleep(delay)
              continue // retry same model
            }
            console.warn(`[gemini] ${model} overloaded after retries — trying next model`)
            break // rotate to the next model
          }
          if (status === 402) {
            // Billing issue — all Gemini models share the same account; no point
            // rotating. Throw immediately so HybridProvider falls back to Groq.
            console.error(`[gemini] 402 Payment Required — prepaid credits depleted. Top up at https://aistudio.google.com/`)
            throw err
          }
          if (status === 400 && sendThinking && THINKING_BUDGET <= 0) {
            // Model refuses thinkingBudget=0 — retry it once without the field
            console.warn(`[gemini] ${model} rejected thinkingConfig (400) — retrying without it`)
            continue // same model, attempt 1 (thinkingConfig omitted)
          }
          if (status === 400) {
            // Still an invalid request on this model — rotate rather than
            // failing the whole build on one bad model
            console.warn(`[gemini] ${model} returned 400 INVALID_ARGUMENT — trying next model`)
            break // rotate to the next model
          }
          // Transient TLS/socket failures — retry the SAME model with backoff
          // before rotating away. Common cause: proxy/firewall hiccups that
          // fail the initial TLS handshake with ECONNRESET before any HTTP
          // status comes back. Same pattern as the Claude provider.
          if (!err.response && isTransientNetworkError(err)) {
            const delay = 400 * (attempt + 1) * (attempt + 1) // 400ms, 1600ms
            console.warn(`[gemini] ${model} network error (${err.code ?? err.message}) — retry in ${delay}ms`)
            await sleep(delay)
            continue // retry same model
          }
          throw err
        }
      }
    }
    throw lastErr ?? new Error('All Gemini models failed')
  }

  /** One logical reply, auto-continued across output-cap truncations. */
  private async generateWithContinuation(
    model: string,
    contents: any[],
    systemPrompt?: string,
    sendThinking = true,
  ): Promise<AIResponse> {
    let full = ''
    let tokens = 0

    for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
      const convo = full
        ? [
            ...contents,
            { role: 'model', parts: [{ text: full }] },
            { role: 'user', parts: [{ text: CONTINUE_PROMPT }] },
          ]
        : contents

      const res = await this.generate(model, convo, systemPrompt, sendThinking)
      full += res.text
      tokens += res.totalTokens ?? 0

      if (res.finishReason !== 'MAX_TOKENS' || !res.text) break
    }

    return { content: full, tokensUsed: tokens || undefined }
  }

  private async generate(model: string, contents: any[], systemPrompt?: string, sendThinking = true): Promise<GenResult> {
    const generationConfig: any = { maxOutputTokens: MAX_OUTPUT_TOKENS }
    // Omitted on the retry path: some models reject thinkingBudget=0 outright
    if (sendThinking) generationConfig.thinkingConfig = { thinkingBudget: THINKING_BUDGET }

    const { data } = await axios.post(
      `${BASE_URL}/${model}:generateContent`,
      {
        systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
        contents,
        generationConfig,
      },
      {
        headers: { 'x-goog-api-key': this.apiKey, 'Content-Type': 'application/json' },
        timeout: 300_000,
      },
    )

    const cand = data.candidates?.[0]
    // Never include thought parts — reasoning text is not reply content
    const text = (cand?.content?.parts ?? [])
      .filter((p: any) => !p.thought)
      .map((p: any) => p.text ?? '')
      .join('')
    return {
      text,
      finishReason: cand?.finishReason,
      totalTokens: data.usageMetadata?.totalTokenCount,
    }
  }
}
