import type { AIProvider, AIMessage, AIResponse } from './base'

// ═══ Hybrid: GPT (GitHub Models) primary + Gemini helper ═══════
// Short, everyday requests go to the free GPT tier as before. Gemini steps
// in automatically when:
//   • the conversation is too long for GitHub Models' small input limit
//     (which would 413) — Gemini's huge context takes those directly
//   • the primary provider is rate limited, rejects the request as too
//     large, or errors — instead of stalling, the helper answers
// The net effect: long agent sessions and big website builds keep flowing
// without losing context or hammering exhausted free-tier quotas.

const LONG_INPUT_CHARS = Number(process.env.HYBRID_LONG_INPUT_CHARS ?? 20_000)

export class HybridProvider implements AIProvider {
  name: string

  // sizeRoute: when true (GitHub Models primary), oversized requests are sent
  // to the helper first because the primary would 413. When false (a big-context
  // primary like Kimi), the primary is ALWAYS tried first and the helper is a
  // pure error/rate-limit fallback.
  constructor(
    private primary: AIProvider,
    private helper: AIProvider,
    private sizeRoute = true,
  ) {
    this.name = `${primary.name}+${helper.name}`
  }

  async chat(messages: AIMessage[], systemPrompt?: string): Promise<AIResponse> {
    const size =
      messages.reduce((n, m) => n + m.content.length, 0) + (systemPrompt?.length ?? 0)

    // Big requests would 413 on GitHub Models anyway — route straight to Gemini
    const [first, second] =
      this.sizeRoute && size > LONG_INPUT_CHARS ? [this.helper, this.primary] : [this.primary, this.helper]

    try {
      return await first.chat(messages, systemPrompt)
    } catch (err: any) {
      const status: number | undefined = err.response?.status
      // A drained paid account answers 400 — "credit balance is too low",
      // "exceeded quota", "billing". Those are absolutely recoverable: the whole
      // point of the free stack is to keep working when the paid tier runs out.
      const body = err.response?.data
      const detail = String(
        body?.error?.message ?? body?.message ?? body?.error?.type ?? err.message ?? '',
      ).toLowerCase()
      const outOfCredit = /credit balance|insufficient|quota|billing|payment|too low/.test(detail)
      const recoverable =
        status === 429 || // rate limited
        status === 413 || // request too large
        status === 410 || // model retired by provider (e.g. Gemini EOL'd a version) — helper likely has its own model catalog
        status === 402 || // prepaid credits depleted — fall back to free tier
        status === 401 || status === 403 || // bad/expired token
        (status ?? 0) >= 500 || // provider down
        outOfCredit || // paid account drained — fall back to the free tier
        !err.response // network failure
      if (!recoverable) throw err

      console.warn(
        `[hybrid] ${first.name} failed (${outOfCredit ? 'out of credit' : status ?? err.code ?? 'network'})` +
        ` — falling back to ${second.name}`,
      )
      try {
        return await second.chat(messages, systemPrompt)
      } catch {
        // Both sides down — surface the first error (it carries the
        // status/retry-after callers' backoff logic understands)
        throw err
      }
    }
  }
}
