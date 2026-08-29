import axios from 'axios'
import type { AIProvider, AIMessage, AIResponse } from './base'

// ═══ GitHub Models with token + model failover ═════════════
// Free-tier rate limits are per GitHub ACCOUNT and per MODEL. To survive
// them, requests rotate through:
//   1. every configured token (GITHUB_AI_TOKEN + any GITHUB_TOKEN_* var)
//   2. then a fallback model chain (each model has its own quota)
// A token+model pair that returns 429 is put on cooldown; a model the API
// reports as unavailable is skipped for the rest of the process.

const BASE_URL = 'https://models.github.ai/inference'

function collectTokens(): string[] {
  const extras = Object.keys(process.env)
    .filter((k) => k.startsWith('GITHUB_TOKEN_'))
    .map((k) => process.env[k])
  const all = [process.env.GITHUB_AI_TOKEN, ...extras]
  return [...new Set(all.filter((t): t is string => !!t && t.length > 20))]
}

const FALLBACK_MODELS = (process.env.GITHUB_AI_FALLBACK_MODELS ?? 'gpt-4.1-mini,gpt-4o-mini')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// token|model pairs on cooldown after a 429 (timestamp when usable again)
const cooldownUntil = new Map<string, number>()
// models the API rejected as unavailable (e.g. gpt-5 family on free tier)
const deadModels = new Set<string>()

const pairKey = (token: string, model: string) => `${token.slice(-8)}|${model}`

function coolingDown(token: string, model: string): boolean {
  const until = cooldownUntil.get(pairKey(token, model))
  return !!until && Date.now() < until
}

function setCooldown(token: string, model: string, err: any) {
  const retryAfter = Number(err.response?.headers?.['retry-after'])
  // Daily caps come back with huge retry-afters — honor them up to 6h
  const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
    ? Math.min(retryAfter, 6 * 3600) * 1000
    : 10 * 60 * 1000
  cooldownUntil.set(pairKey(token, model), Date.now() + waitMs)
  console.warn(`[github-ai] rate limited: ${model} on token …${token.slice(-6)} — cooling down ${Math.round(waitMs / 60000)}min`)
}

export class GitHubAIProvider implements AIProvider {
  name = 'github'
  private model: string

  constructor(_token?: string, model?: string) {
    // tokens come from the pool; the constructor arg is kept for
    // compatibility with the factory signature
    this.model = model ?? process.env.GITHUB_AI_MODEL ?? 'gpt-4.1'
  }

  async chat(messages: AIMessage[], systemPrompt?: string): Promise<AIResponse> {
    const tokens = collectTokens()
    if (!tokens.length) throw new Error('No GitHub Models tokens configured (GITHUB_AI_TOKEN)')

    const models = [...new Set([this.model, ...FALLBACK_MODELS])].filter((m) => !deadModels.has(m))
    if (!models.length) throw new Error('All configured GitHub Models are unavailable')

    let lastRateLimitErr: any = null

    for (const model of models) {
      for (const token of tokens) {
        if (coolingDown(token, model)) continue

        try {
          return await this.request(model, token, messages, systemPrompt)
        } catch (err: any) {
          const status = err.response?.status
          const code = err.response?.data?.error?.code

          // Model not served on this tier → drop it from the rotation
          if (code === 'unavailable_model' || status === 404) {
            console.warn(`[github-ai] model "${model}" unavailable — removing from rotation`)
            deadModels.add(model)
            break // next model
          }

          // Rate limited → cool this pair down, try the next token
          if (status === 429) {
            setCooldown(token, model, err)
            lastRateLimitErr = err
            continue
          }

          // Bad/expired token → long cooldown on every model for it
          if (status === 401 || status === 403) {
            console.warn(`[github-ai] token …${token.slice(-6)} rejected (${status}) — disabling for 24h`)
            for (const m of models) cooldownUntil.set(pairKey(token, m), Date.now() + 24 * 3600 * 1000)
            lastRateLimitErr = lastRateLimitErr ?? err
            continue
          }

          // Anything else (413 too large, 400 bad request, network) is a real
          // error the caller's own retry/compaction logic must see
          throw err
        }
      }
    }

    // Everything in the pool is rate limited or down. Re-throw the last 429
    // (it carries response/status/retry-after) so callers back off properly.
    throw lastRateLimitErr
      ?? new Error('All GitHub Models tokens and fallback models are rate limited — try again later')
  }

  private async request(
    model: string,
    token: string,
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
        max_tokens: 8000,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
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
