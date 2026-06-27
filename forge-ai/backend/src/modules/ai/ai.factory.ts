import type { AIProvider } from './providers/base'
import { OpenAIProvider } from './providers/openai'
import { ClaudeProvider } from './providers/claude'
import { GeminiProvider } from './providers/gemini'
import { GitHubAIProvider } from './providers/github'   // add this

export type ProviderName = 'openai' | 'claude' | 'gemini' | 'github'  // add 'github'

export function createProvider(name: ProviderName): AIProvider {
  switch (name) {
    case 'openai':
      if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set')
      return new OpenAIProvider(process.env.OPENAI_API_KEY)
    case 'claude':
      if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set')
      return new ClaudeProvider(process.env.ANTHROPIC_API_KEY)
    case 'gemini':
      if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set')
      return new GeminiProvider(process.env.GEMINI_API_KEY)
    case 'github':                                        // add this case
      if (!process.env.GITHUB_AI_TOKEN) throw new Error('GITHUB_AI_TOKEN not set')
      return new GitHubAIProvider(process.env.GITHUB_AI_TOKEN)
    default:
      throw new Error(`Unknown provider: ${name}`)
  }
}

export function getDefaultProvider(): AIProvider {
  const name = (process.env.DEFAULT_AI_PROVIDER ?? 'github') as ProviderName
  return createProvider(name)
}