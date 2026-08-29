import type { RawTable } from '../ingest'

/**
 * Every data source (uploaded file, Google Sheet, Stripe, future Shopify/
 * QuickBooks) has to end up as the same RawTable so downstream cleaning +
 * metric stages can stay source-agnostic. Adapters convert their own
 * proprietary shape into that.
 */
export interface SourceAdapter<Config> {
  /** Programmatic id ('upload' | 'google_sheet' | 'stripe' | …). */
  kind: string
  /** Load rows from the source into a RawTable. Throws with a client-safe
   *  message on any recoverable failure (missing perms, sheet not found). */
  fetch(config: Config, ctx: SourceContext): Promise<RawTable>
}

/** Per-request context — provides access to per-user credentials without
 *  each adapter having to know about the auth store or DB model. */
export interface SourceContext {
  userId: string
  /** OAuth tokens the user has connected. Adapters read the entry they need
   *  ('google', 'stripe') and refuse if missing. */
  tokens: Record<string, TokenBundle | undefined>
  /** Called after a successful refresh_token exchange so the fresh access
   *  token gets persisted for the next fetch. */
  saveTokens?: (provider: string, tokens: TokenBundle) => Promise<void>
}

export interface TokenBundle {
  accessToken: string
  refreshToken?: string
  /** Unix ms when accessToken becomes invalid. Missing = don't know, treat as
   *  potentially expired. */
  expiresAt?: number
  /** Provider-specific scope granted, for debugging. */
  scope?: string
  /** Provider-specific extras — e.g. Stripe connected account id. */
  meta?: Record<string, unknown>
}
