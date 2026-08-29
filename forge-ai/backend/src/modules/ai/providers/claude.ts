import axios from 'axios'
import type { AIProvider, AIMessage, AIResponse } from './base'

// Transient TLS/socket failures on the way to api.anthropic.com are common on
// flaky networks (ECONNRESET before the handshake, ETIMEDOUT, EAI_AGAIN, socket
// hang-ups). Without a retry the very first hiccup surrenders to the hybrid
// fallback, which is expensive and pointless when a 300ms retry would succeed.
// Retries are ONLY for network errors — anything with an HTTP response
// (429/400/etc.) is left for the caller's own backoff/routing logic.
const NETWORK_RETRY_CODES = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'ENOTFOUND', 'EPIPE', 'ERR_SOCKET_DISCONNECTED_BEFORE_SECURE_TLS_CONNECTION',
])
const RETRY_ATTEMPTS = Number(process.env.CLAUDE_NETWORK_RETRIES ?? 3)
const RETRY_BASE_MS = Number(process.env.CLAUDE_NETWORK_RETRY_BASE_MS ?? 400)

function isTransientNetworkError(err: any): boolean {
  if (err?.response) return false // real HTTP status came back — not a network fault
  const code = err?.code
  if (code && NETWORK_RETRY_CODES.has(code)) return true
  // axios wraps socket hang-ups without a code in some Node versions
  const msg = String(err?.message ?? '').toLowerCase()
  return /socket|network|tls|reset|hang up|handshake|econnreset|etimedout/.test(msg)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class ClaudeProvider implements AIProvider {
  name = 'claude'
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async chat(messages: AIMessage[], systemPrompt?: string): Promise<AIResponse> {
    let lastErr: any
    for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        return await this.request(messages, systemPrompt)
      } catch (err: any) {
        lastErr = err
        if (attempt >= RETRY_ATTEMPTS || !isTransientNetworkError(err)) throw err
        const delay = RETRY_BASE_MS * 2 ** attempt
        console.warn(`[claude] network error (${err.code ?? err.message}) — retry ${attempt + 1}/${RETRY_ATTEMPTS} in ${delay}ms`)
        await sleep(delay)
      }
    }
    throw lastErr
  }

  private async request(messages: AIMessage[], systemPrompt?: string): Promise<AIResponse> {
    const { data } = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
        max_tokens: 8000,
        // Sonnet 5 runs adaptive thinking by DEFAULT. Left on, the reply is
        // [thinking, text] and the thinking tokens eat the 8k budget (files
        // truncate) while billing at output rates. The builder only needs the
        // file, so thinking is off unless ANTHROPIC_THINKING=adaptive is set.
        thinking: process.env.ANTHROPIC_THINKING === 'adaptive'
          ? { type: 'adaptive' }
          : { type: 'disabled' },
        // Prompt caching: the builder re-sends the same system prompt on every
        // per-file request, so caching it makes each call after the first bill
        // that prefix at ~0.1x instead of full input price. cache_control only
        // attaches to content blocks, hence the array form instead of a string.
        system: [
          {
            type: 'text',
            text: systemPrompt ?? 'You are an expert software engineer helping fix code.',
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: messages.filter((m) => m.role !== 'system').map((m) => ({
          role: m.role,
          content: m.images?.length
            ? [
                { type: 'text', text: m.content },
                ...m.images.map((url) => {
                  // data:image/png;base64,AAAA → Anthropic source block
                  const [, mediaType = 'image/png', data = ''] = url.match(/^data:([^;]+);base64,(.*)$/s) ?? []
                  return { type: 'image', source: { type: 'base64', media_type: mediaType, data } }
                }),
              ]
            : m.content,
        })),
      },
      {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        // Cap the request so a half-open socket can't stall the whole build.
        // 5 min is generous — long file generations can legitimately take a while.
        timeout: Number(process.env.CLAUDE_TIMEOUT_MS ?? 300_000),
      },
    )

    // The response is [thinking?, text, …] — never assume content[0] is text
    // (with thinking on it's a thinking block). Join every text block.
    const content: string = (data.content ?? [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')

    return {
      content,
      tokensUsed: data.usage?.input_tokens + data.usage?.output_tokens,
    }
  }
}
