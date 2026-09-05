import axios from 'axios'
import type { RawTable } from '../ingest'
import type { SourceAdapter, SourceContext, TokenBundle } from './adapter'

/**
 * Google Sheets adapter. The heavy `googleapis` SDK is dynamic-imported so
 * a missing env config (client id/secret) doesn't crash the whole backend
 * at boot — the /connect endpoint returns a 501 instead.
 *
 * Config accepts either the sheet URL or an explicit spreadsheetId — we
 * try both and let the client pick whichever they have. Sheet tab is
 * optional: the FIRST tab is used unless the caller names one.
 */
export interface GoogleSheetSourceConfig {
  /** Full "docs.google.com/spreadsheets/…" URL, if the user has it. */
  url?: string
  /** OR the raw spreadsheet id if the caller already parsed it. */
  spreadsheetId?: string
  /** Optional tab name — defaults to the first tab. */
  sheetName?: string
  /** Optional A1-notation range like "A1:F". Defaults to the whole tab. */
  range?: string
}

/** Extract a spreadsheetId from any Google Sheets URL shape:
 *  docs.google.com/spreadsheets/d/{id}/edit#gid=…
 *  docs.google.com/spreadsheets/d/{id}/
 *  spreadsheets/d/{id} */
export function extractSpreadsheetId(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/)
  return m ? m[1] : null
}

export const GoogleSheetsSource: SourceAdapter<GoogleSheetSourceConfig> = {
  kind: 'google_sheet',
  async fetch(config, ctx): Promise<RawTable> {
    const bundle = ctx.tokens.google
    if (!bundle) {
      throw new Error(
        'Not connected to Google. Open the dashboard settings and click "Connect Google Sheets" first.',
      )
    }
    const accessToken = await ensureFreshAccessToken(bundle, ctx)

    let spreadsheetId = config.spreadsheetId
    if (!spreadsheetId && config.url) spreadsheetId = extractSpreadsheetId(config.url) ?? undefined
    if (!spreadsheetId) throw new Error('Provide a Google Sheets url or spreadsheetId in the source config.')

    // If no explicit tab, look up the workbook to pick the first tab name.
    const sheetName = config.sheetName ?? (await firstSheetName(spreadsheetId, accessToken))
    const range = config.range ? `${sheetName}!${config.range}` : sheetName

    const { data } = await axios.get(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { valueRenderOption: 'FORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING' },
        timeout: 30_000,
      },
    ).catch((err) => {
      const status = err?.response?.status
      const msg = err?.response?.data?.error?.message ?? err?.message
      if (status === 403) throw new Error(`Google refused the request (403). The sheet must be shared with the connected Google account. ${msg}`)
      if (status === 404) throw new Error(`Sheet "${spreadsheetId}" / tab "${sheetName}" not found (404). Check the URL and tab name.`)
      throw new Error(`Google Sheets API error (${status ?? 'network'}): ${msg}`)
    }) as { data: { values?: any[][]; range?: string } }

    const grid = data.values ?? []
    if (!grid.length) throw new Error('The sheet is empty (no rows returned).')

    // Same header-normalization as the CSV parser: dedupe blanks, trim.
    const [headerRow, ...bodyRows] = grid
    const seen = new Map<string, number>()
    const notes: string[] = []
    const headers = headerRow.map((raw: any, i: number) => {
      const base = String(raw ?? '').trim() || `column_${i + 1}`
      const prior = seen.get(base) ?? 0
      seen.set(base, prior + 1)
      if (prior > 0) {
        const disambig = `${base}_${prior + 1}`
        notes.push(`Duplicate header "${base}" at column ${i + 1} → renamed to "${disambig}"`)
        return disambig
      }
      return base
    })
    const rows: Record<string, string>[] = bodyRows.map((cells) => {
      const row: Record<string, string> = {}
      for (let i = 0; i < headers.length; i++) row[headers[i]] = String(cells[i] ?? '')
      return row
    })

    return {
      kind: 'csv', // downstream stages just need "tabular" — we pretend it's csv-shaped
      filename: `${spreadsheetId} · ${sheetName}`,
      bytes: JSON.stringify(grid).length,
      headers,
      rows,
      notes,
    }
  },
}

async function firstSheetName(spreadsheetId: string, accessToken: string): Promise<string> {
  const { data } = await axios.get(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
    { headers: { Authorization: `Bearer ${accessToken}` }, params: { fields: 'sheets.properties.title' }, timeout: 15_000 },
  ) as { data: { sheets?: { properties?: { title?: string } }[] } }
  const title = data.sheets?.[0]?.properties?.title
  if (!title) throw new Error('The workbook has no sheets to read.')
  return title
}

/** Refresh the access token if it's expired or about to expire. Persist the
 *  new one via ctx.saveTokens so future runs skip this round-trip. */
async function ensureFreshAccessToken(bundle: TokenBundle, ctx: SourceContext): Promise<string> {
  // 60s grace so an in-flight request doesn't fire mid-expiry.
  if (bundle.expiresAt && bundle.expiresAt - Date.now() > 60_000) return bundle.accessToken

  if (!bundle.refreshToken) {
    // No refresh token = user granted the app with access_type=online, or their grant lapsed.
    return bundle.accessToken // best-effort; 401 will surface upstream
  }
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured on the server.')

  const { data } = await axios.post(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: bundle.refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15_000 },
  ) as { data: { access_token: string; expires_in?: number; scope?: string } }

  const refreshed: TokenBundle = {
    accessToken: data.access_token,
    refreshToken: bundle.refreshToken, // Google doesn't rotate refresh tokens on this flow
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    scope: data.scope ?? bundle.scope,
    meta: bundle.meta,
  }
  if (ctx.saveTokens) await ctx.saveTokens('google', refreshed)
  return refreshed.accessToken
}
