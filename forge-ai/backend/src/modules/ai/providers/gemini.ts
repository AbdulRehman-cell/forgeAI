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

const FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS ?? 'gemini-3.5-flash,gemini-3.6-flash,gemini-3.7-flash,gemini-3.8-flash,gemini-flash-latest')
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

// Quota circuit breaker. The free tier allows ~20 requests/day PER MODEL, and
// once a model's daily quota is gone every call to it is a guaranteed 429 for
// hours. Without remembering that, each file of a build re-walked the whole
// model chain (and the builder slept between retries) before reaching its
// fallback — minutes of dead time per file. Key = `${apiKey}:${model}`
// (in memory only), value = epoch ms when the quota should be back.
const cooldownUntil = new Map<string, number>()

// Keys Google reported as free tier (a 429 whose quota ids end in "-FreeTier").
// Each key belongs to its own Google project, and only projects with billing
// get paid quotas — a free key listed first would otherwise be tried first on
// every call while the paid key sat unused.
const freeTierKeys = new Set<string>()

/** Extra keys (GEMINI_API_KEY_2, _3) — a key from another Google project has
 *  its own quota, so rotating keys multiplies daily capacity. */
function extraKeys(primary: string): string[] {
  return [process.env.GEMINI_API_KEY_2, process.env.GEMINI_API_KEY_3]
    .filter((k): k is string => !!k && !k.includes('...') && k !== primary)
}

/** Configured order, except keys known to be free tier go last. */
function orderedKeys(primary: string): string[] {
  const all = [primary, ...extraKeys(primary)]
  return [...all.filter((k) => !freeTierKeys.has(k)), ...all.filter((k) => freeTierKeys.has(k))]
}

/** Short, safe label for logs — never the key itself. */
const keyLabel = (k: string) => `…${k.slice(-4)}`

function isFreeTierQuota(err: any): boolean {
  const details = err?.response?.data?.error?.details ?? []
  return details.some((d: any) => (d?.violations ?? []).some((v: any) => /FreeTier/i.test(String(v?.quotaId ?? ''))))
}

/** RetryInfo.retryDelay ("23144s") or the "Please retry in 6h25m44s" text, in ms. */
function retryAfterMs(err: any): number | null {
  const body = err?.response?.data?.error
  const info = (body?.details ?? []).find((d: any) => typeof d?.retryDelay === 'string')
  if (info) {
    const s = parseFloat(info.retryDelay)
    if (Number.isFinite(s)) return s * 1000
  }
  const m = /retry in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i.exec(String(body?.message ?? ''))
  if (m && (m[1] || m[2] || m[3])) {
    return ((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 1000
  }
  return null
}

/** True for daily (not per-minute) quota exhaustion — it won't clear for hours. */
function isDailyQuota(err: any): boolean {
  const body = err?.response?.data?.error
  const ids = (body?.details ?? []).flatMap((d: any) => (d?.violations ?? []).map((v: any) => String(v?.quotaId ?? '')))
  return ids.some((id: string) => /PerDay/i.test(id)) || /per day/i.test(String(body?.message ?? ''))
}

/** Whether at least one Gemini key/model can currently take a request. Lets
 *  callers skip straight to their fallback instead of burning retries. */
export function geminiAvailable(): boolean {
  const k = process.env.GEMINI_API_KEY
  if (!k || k.includes('...')) return false
  const keys = orderedKeys(k)
  const model = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash'
  const models = [...new Set([model, ...FALLBACK_MODELS])].filter((m) => !deadModels.has(m))
  const now = Date.now()
  return keys.some((key) => models.some((m) => (cooldownUntil.get(`${key}:${m}`) ?? 0) <= now))
}

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
    this.model = model ?? process.env.GEMINI_MODEL ?? 'gemini-3.5-flash'
  }

  async chat(messages: AIMessage[], systemPrompt?: string): Promise<AIResponse> {
    const contents = messages.map(toContent)
    const models = [...new Set([this.model, ...FALLBACK_MODELS])].filter((m) => !deadModels.has(m))
    if (!models.length) throw new Error('All configured Gemini models are unavailable')
    // Models outer, keys inner: when one key's quota for a model is gone, the
    // next key gets the SAME (preferred) model before anything falls down the
    // chain to older or busier models.
    let lastErr: any = null
    let skipped = 0
    for (const model of models) {
    let skipModel = false
    for (const key of orderedKeys(this.apiKey)) {
      if (skipModel || deadModels.has(model)) break
      const slot = `${key}:${model}`
      if ((cooldownUntil.get(slot) ?? 0) > Date.now()) { skipped++; continue }
      // Inner loop attempts (per model):
      //   attempt 0: send with thinkingConfig
      //   attempt 1: retry without thinkingConfig (some models 400 on budget=0)
      //   attempts 2-3: 503 backoff slots (5s, 10s)
      for (let attempt = 0; attempt < 4; attempt++) {
        const sendThinking = attempt === 0
        try {
          return await this.generateWithContinuation(model, contents, systemPrompt, sendThinking, key)
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
          // Rate limited → remember for how long, then the next key (own quota)
          if (status === 429) {
            const daily = isDailyQuota(err)
            const free = isFreeTierQuota(err)
            if (free && !freeTierKeys.has(key)) {
              freeTierKeys.add(key)
              console.warn(`[gemini] key ${keyLabel(key)} is on the FREE tier (its Google project has no billing) — trying paid keys first from now on`)
            }
            const wait = retryAfterMs(err) ?? (daily ? 3_600_000 : 30_000)
            cooldownUntil.set(slot, Date.now() + wait)
            console.warn(`[gemini] ${model} (key ${keyLabel(key)}) ${daily ? 'daily quota exhausted' : 'rate limited'} — cooling down ${Math.round(wait / 60_000)}m, trying next key`)
            break // next key, same model
          }
          // 503 overloaded — retry with exponential backoff before rotating.
          // Two retries (5s, 10s): a longer wait just stalls the build while
          // another key or model is usually fine.
          if (status === 503) {
            const maxRetries = 3
            if (attempt < maxRetries) {
              const delay = attempt === 0 ? 5000 : 10_000
              console.warn(`[gemini] ${model} overloaded (503) — retry in ${delay}ms`)
              await sleep(delay)
              continue // retry same model
            }
            console.warn(`[gemini] ${model} overloaded after retries — trying next key/model`)
            break // next key, then next model
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
            // Still an invalid request on this model — another key won't
            // change that, so rotate to the next model
            console.warn(`[gemini] ${model} returned 400 INVALID_ARGUMENT — trying next model`)
            skipModel = true
            break
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
    }
    if (!lastErr && skipped) {
      // Every key/model is cooling down — fail fast with a 429-shaped error so
      // HybridProvider and the builder fall back immediately (no network call).
      const soonest = Math.min(...[...cooldownUntil.values()].filter((t) => t > Date.now()))
      const mins = Number.isFinite(soonest) ? Math.ceil((soonest - Date.now()) / 60_000) : 60
      const err: any = new Error(`Gemini quota exhausted on every key and model — resets in ~${mins} min`)
      err.response = { status: 429, data: { error: { message: err.message } } }
      throw err
    }
    throw lastErr ?? new Error('All Gemini models failed')
  }

  /** One logical reply, auto-continued across output-cap truncations. */
  private async generateWithContinuation(
    model: string,
    contents: any[],
    systemPrompt?: string,
    sendThinking = true,
    apiKey = this.apiKey,
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

      const res = await this.generate(model, convo, systemPrompt, sendThinking, apiKey)
      full += res.text
      tokens += res.totalTokens ?? 0

      if (res.finishReason !== 'MAX_TOKENS' || !res.text) break
    }

    return { content: full, tokensUsed: tokens || undefined }
  }

  private async generate(model: string, contents: any[], systemPrompt?: string, sendThinking = true, apiKey = this.apiKey): Promise<GenResult> {
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
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        // Callers (safeChat) give up after ~2-3 min; a request left running past
        // that only holds a socket and its response buffer in a small heap.
        timeout: Number(process.env.GEMINI_TIMEOUT_MS ?? 170_000),
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
