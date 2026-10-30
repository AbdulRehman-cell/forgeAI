import type { AIProvider } from './providers/base'
import { OpenAIProvider } from './providers/openai'
import { ClaudeProvider } from './providers/claude'
import { GeminiProvider } from './providers/gemini'
import { GitHubAIProvider } from './providers/github'
import { GroqProvider } from './providers/groq'
import { KimiProvider } from './providers/kimi'
import { HybridProvider } from './providers/hybrid'

export type ProviderName = 'openai' | 'claude' | 'gemini' | 'github' | 'kimi'

/** The Gemini key when actually configured (".env" placeholders don't count). */
export function geminiKey(): string | undefined {
  const k = process.env.GEMINI_API_KEY
  return k && !k.includes('...') ? k : undefined
}

/** The free stack: Gemini primary + Groq fallback. When Gemini gets rate
 *  limited (429), the in-flight request silently falls over to Groq — each
 *  file generation is an independent call, so completed files never get
 *  regenerated, only the ONE call Gemini refused. Groq's free tier serves
 *  Llama 3.3 70B at ~500 tok/s.
 *
 *  Priority order for the helper: Groq > GitHub Models (dying). If neither
 *  is configured, Gemini runs alone. */
function freeStack(model?: string): AIProvider {
  const gk = geminiKey()
  if (!gk) {
    throw new Error(
      'GEMINI_API_KEY not set — GitHub Models has been retired by Microsoft, so a Gemini key is now required for the free tier. Get one free at https://aistudio.google.com/app/apikey and add GEMINI_API_KEY=... to your .env',
    )
  }
  const gemini = new GeminiProvider(gk)

  // Groq preferred — modern, generous free tier, actively supported.
  const groqKey = process.env.GROQ_API_KEY
  if (groqKey && !groqKey.includes('...')) {
    // sizeRoute=false: Gemini is ALWAYS tried first (huge context), Groq is a
    // pure rate-limit/error fallback rather than a big-input helper.
    return new HybridProvider(gemini, new GroqProvider(groqKey), false)
  }

  // GitHub Models is dying but not fully dark — legacy fallback until users
  // migrate off. Delete once the service is fully decommissioned.
  if (process.env.GITHUB_AI_TOKEN) {
    // sizeRoute=false: Gemini first, always. With size routing the big requests
    // (whole page prompts) went to GitHub's small-context model first.
    return new HybridProvider(gemini, new GitHubAIProvider(process.env.GITHUB_AI_TOKEN, model), false)
  }
  return gemini
}

export function createProvider(name: ProviderName, model?: string): AIProvider {
  switch (name) {
    case 'openai':
      if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set')
      return new OpenAIProvider(process.env.OPENAI_API_KEY)
    case 'claude': {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set')
      // Claude is tried first, but a paid account can run out of credit (or hit a
      // rate limit) at any moment. Falling back to the free stack keeps builds and
      // deploys working instead of failing outright on a billing error.
      const claude = new ClaudeProvider(process.env.ANTHROPIC_API_KEY)
      try {
        return new HybridProvider(claude, freeStack(model), false)
      } catch {
        return claude // no GitHub token configured — Claude alone
      }
    }
    case 'gemini':
      if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set')
      // Groq is wired as a per-call fallback — when Gemini 429s, the one in-flight
      // call retries on Groq; completed files are never regenerated.
      return freeStack(model)
    case 'github':
      return freeStack(model)
    case 'kimi': {
      if (!process.env.KIMI_API_KEY) throw new Error('KIMI_API_KEY not set')
      // Kimi (256k context) is always tried first (sizeRoute=false); if it is
      // unavailable (billing/rate limit) the whole free stack covers it.
      const kimi = new KimiProvider(process.env.KIMI_API_KEY, process.env.KIMI_MODEL)
      try {
        return new HybridProvider(kimi, freeStack(model), false)
      } catch {
        return kimi // no GitHub token configured — Kimi alone
      }
    }
    default:
      throw new Error(`Unknown provider: ${name}`)
  }
}

const ENV_KEYS: Record<ProviderName, string> = {
  openai: 'OPENAI_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  github: 'GITHUB_AI_TOKEN',
  kimi: 'KIMI_API_KEY',
}

/**
 * The provider the user picked in Settings, when its API key is actually
 * configured — otherwise fall back to Gemini (the new free-tier primary
 * since Microsoft retired GitHub Models). Placeholder values (".env"
 * templates like "sk-ant-...") don't count.
 */
export function resolveProvider(preferred?: string | null): ProviderName {
  const name = (preferred ?? process.env.DEFAULT_AI_PROVIDER ?? 'gemini') as ProviderName
  const key = process.env[ENV_KEYS[name] ?? '']
  if (key && !key.includes('...')) return name
  // Fall back to Gemini if the preferred provider's key isn't set. Old
  // 'github' fallback is dead — Microsoft's brownout is one-way.
  return geminiKey() ? 'gemini' : 'github'
}

export function getDefaultProvider(): AIProvider {
  const name = (process.env.DEFAULT_AI_PROVIDER ?? 'gemini') as ProviderName
  return createProvider(name)
}