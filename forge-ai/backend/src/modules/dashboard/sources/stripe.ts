import type { RawTable } from '../ingest'
import type { SourceAdapter, SourceContext } from './adapter'

/**
 * Stripe adapter. Reads the connected account's charges + subscriptions and
 * flattens them into a single "one row per charge/subscription event" table.
 * Downstream metric selection sees natural revenue + count columns and picks
 * total_revenue-over-time + growth automatically.
 *
 * Stripe already has a very consistent schema, so this is one of the more
 * pleasant sources to write. Uses Stripe Connect: users authorize their
 * account via OAuth, we store their stripe_user_id and call the API "on
 * behalf of" that account via the Stripe-Account header.
 */
export interface StripeSourceConfig {
  /** What to pull. Both = union of charges + subscription events (each in its
   *  own row, tagged in `source_object`). */
  include?: 'charges' | 'subscriptions' | 'both'
  /** Look-back window in days. Default 90 — a quarter of activity. */
  windowDays?: number
  /** Max rows to fetch per call (Stripe caps at 100). Default 100. */
  pageSize?: number
  /** Safety cap on total rows so a huge account doesn't blow through the whole
   *  Stripe API in one pull. Default 5000. */
  maxRows?: number
}

export const StripeSource: SourceAdapter<StripeSourceConfig> = {
  kind: 'stripe',
  async fetch(config, ctx): Promise<RawTable> {
    const bundle = ctx.tokens.stripe
    const accountId = bundle?.meta?.stripe_user_id as string | undefined
    if (!bundle || !accountId) {
      throw new Error('Not connected to Stripe. Open the dashboard settings and click "Connect Stripe" first.')
    }

    // Dynamic import so the whole backend doesn't require the stripe package
    // to boot — it's optional if no one uses this connector.
    let Stripe: any
    try { Stripe = (await import('stripe')).default }
    catch { throw new Error('stripe npm package not installed on the server.') }

    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) throw new Error('STRIPE_SECRET_KEY not configured on the server.')

    const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' })
    const include = config.include ?? 'both'
    const windowDays = config.windowDays ?? 90
    const pageSize = Math.min(100, Math.max(1, config.pageSize ?? 100))
    const maxRows = Math.min(20_000, Math.max(100, config.maxRows ?? 5000))
    const sinceUnix = Math.floor((Date.now() - windowDays * 86_400_000) / 1000)

    const rows: Record<string, string>[] = []

    if (include === 'charges' || include === 'both') {
      for await (const charge of paginate(stripe, 'charges', accountId, sinceUnix, pageSize, maxRows - rows.length)) {
        rows.push(flattenCharge(charge))
        if (rows.length >= maxRows) break
      }
    }
    if ((include === 'subscriptions' || include === 'both') && rows.length < maxRows) {
      for await (const sub of paginate(stripe, 'subscriptions', accountId, sinceUnix, pageSize, maxRows - rows.length)) {
        rows.push(flattenSubscription(sub))
        if (rows.length >= maxRows) break
      }
    }

    const headers = [
      'source_object', 'id', 'created', 'currency', 'amount', 'status',
      'customer_id', 'customer_email', 'description', 'metadata',
    ]

    return {
      kind: 'csv',
      filename: `stripe · ${accountId} · last ${windowDays} days`,
      bytes: JSON.stringify(rows).length,
      headers,
      rows,
      notes: rows.length >= maxRows
        ? [`Reached maxRows cap (${maxRows}) — older data was not fetched. Raise maxRows in config to pull more.`]
        : [],
    }
  },
}

/** Charges: amount is in the smallest currency unit (cents) — convert to major
 *  units so the profiler sees natural money numbers, not "10000 = $100". */
function flattenCharge(c: any): Record<string, string> {
  return {
    source_object: 'charge',
    id: c.id,
    created: new Date(c.created * 1000).toISOString().slice(0, 10),
    currency: (c.currency ?? '').toUpperCase(),
    amount: minorToMajor(c.amount, c.currency),
    status: c.status ?? '',
    customer_id: c.customer ?? '',
    customer_email: c.receipt_email ?? c.billing_details?.email ?? '',
    description: c.description ?? '',
    metadata: c.metadata ? JSON.stringify(c.metadata) : '',
  }
}

/** Subscriptions: sum item plan amounts × quantities as the row's "amount"
 *  (per-billing-period, in major units). Same schema shape as charges so
 *  downstream metric inference can process the union. */
function flattenSubscription(s: any): Record<string, string> {
  const currency = s.currency ?? s.items?.data?.[0]?.plan?.currency ?? ''
  const totalMinor = (s.items?.data ?? []).reduce(
    (sum: number, item: any) => sum + (item.plan?.amount ?? 0) * (item.quantity ?? 1),
    0,
  )
  return {
    source_object: 'subscription',
    id: s.id,
    created: new Date(s.created * 1000).toISOString().slice(0, 10),
    currency: (currency ?? '').toUpperCase(),
    amount: minorToMajor(totalMinor, currency),
    status: s.status ?? '',
    customer_id: s.customer ?? '',
    customer_email: '',
    description: `${s.items?.data?.length ?? 0} item(s)`,
    metadata: s.metadata ? JSON.stringify(s.metadata) : '',
  }
}

/** Zero-decimal currencies (JPY, KRW etc.) — Stripe's `amount` is already the
 *  major unit for those. Everything else has 2 decimals. */
const ZERO_DECIMAL = new Set(['jpy', 'krw', 'vnd', 'clp', 'pyg', 'rwf', 'xaf', 'xof', 'xpf', 'bif', 'djf', 'gnf', 'kmf', 'mga', 'mgf', 'ugx', 'vuv'])
function minorToMajor(minor: number, currency: string): string {
  if (!Number.isFinite(minor)) return ''
  if (ZERO_DECIMAL.has((currency ?? '').toLowerCase())) return String(minor)
  return (minor / 100).toFixed(2)
}

async function* paginate(
  stripe: any, resource: 'charges' | 'subscriptions',
  accountId: string, sinceUnix: number, limit: number, budget: number,
): AsyncGenerator<any> {
  const params: any = { limit, created: { gte: sinceUnix } }
  if (resource === 'subscriptions') delete params.created
  let starting_after: string | undefined
  let yielded = 0
  while (yielded < budget) {
    const req: any = { ...params, ...(starting_after ? { starting_after } : {}) }
    const page = await stripe[resource].list(req, { stripeAccount: accountId })
    for (const item of page.data) {
      yield item
      yielded++
      if (yielded >= budget) return
    }
    if (!page.has_more || !page.data.length) return
    starting_after = page.data[page.data.length - 1].id
  }
}
