import type { SourceAdapter, SourceContext, TokenBundle } from './adapter'
import { UploadSource } from './upload'
import { GoogleSheetsSource } from './googleSheets'
import { StripeSource } from './stripe'
import { User } from '../../users/user.model'

/** Dispatch table keyed by dashboardSource.kind. */
const ADAPTERS: Record<string, SourceAdapter<any>> = {
  upload: UploadSource,
  google_sheet: GoogleSheetsSource,
  stripe: StripeSource,
}

export function getAdapter(kind: string): SourceAdapter<any> {
  const a = ADAPTERS[kind]
  if (!a) throw new Error(`Unknown source kind: "${kind}". Registered kinds: ${Object.keys(ADAPTERS).join(', ')}`)
  return a
}

/**
 * Build a per-user SourceContext (loaded tokens + persist-back callback).
 * Adapters use this to avoid touching the User model directly.
 */
export async function buildSourceContext(userId: string): Promise<SourceContext> {
  // MongoDB rejects a projection that names both a parent object and its
  // sub-paths in the same query (Location31249 "Path collision"). The
  // dashboardTokens tree is included by default; only its select:false leaf
  // fields need to be explicitly re-included.
  const user = await User.findById(userId).select('+dashboardTokens.google.accessToken +dashboardTokens.google.refreshToken +dashboardTokens.stripe.accessToken')
  const tokens: Record<string, TokenBundle | undefined> = {}

  if (user?.dashboardTokens?.google?.accessToken) {
    tokens.google = {
      accessToken: user.dashboardTokens.google.accessToken,
      refreshToken: user.dashboardTokens.google.refreshToken,
      expiresAt: user.dashboardTokens.google.expiresAt,
      scope: user.dashboardTokens.google.scope,
    }
  }
  if (user?.dashboardTokens?.stripe?.accessToken && user.dashboardTokens.stripe.stripeUserId) {
    tokens.stripe = {
      accessToken: user.dashboardTokens.stripe.accessToken,
      scope: user.dashboardTokens.stripe.scope,
      meta: {
        stripe_user_id: user.dashboardTokens.stripe.stripeUserId,
        livemode: user.dashboardTokens.stripe.livemode,
      },
    }
  }

  return {
    userId,
    tokens,
    async saveTokens(provider, bundle) {
      if (provider === 'google') {
        await User.updateOne({ _id: userId }, {
          $set: {
            'dashboardTokens.google.accessToken': bundle.accessToken,
            'dashboardTokens.google.refreshToken': bundle.refreshToken,
            'dashboardTokens.google.expiresAt': bundle.expiresAt,
            'dashboardTokens.google.scope': bundle.scope,
          },
        })
      }
    },
  }
}

export { UploadSource, GoogleSheetsSource, StripeSource }
export type { SourceAdapter, SourceContext, TokenBundle }
