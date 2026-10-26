const SUPABASE_API = 'https://api.supabase.com'

export interface SupabaseCredentials {
  ref: string
  url: string
  anonKey: string
  /** Postgres schema the site's tables live in — 'public' for a dedicated
   *  project, a per-site schema when hosted inside the shared project. */
  schema: string
  shared: boolean
}

export type SupabaseAccess = 'public_read' | 'public_write' | 'auth_required'
export interface SupabaseColumn { name: string; type: string; nullable?: boolean }
export interface SupabaseTable { name: string; columns: SupabaseColumn[]; access: SupabaseAccess }
export type SeedRows = Record<string, Array<Record<string, unknown>>>

type Log = (message: string) => unknown

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function getToken(): string {
  const t = process.env.SUPABASE_ACCESS_TOKEN
  if (!t) throw new Error('SUPABASE_ACCESS_TOKEN not set — add it to .env to use Supabase mode')
  return t
}

class SupabaseApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

async function apiReq(method: string, endpoint: string, body?: object, timeoutMs = 60_000): Promise<any> {
  const res = await fetch(`${SUPABASE_API}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text()
  if (!res.ok) throw new SupabaseApiError(`Supabase API ${method} ${endpoint} → ${res.status}: ${text.slice(0, 300)}`, res.status)
  return text ? JSON.parse(text) : null
}

async function getOrgId(): Promise<string> {
  const orgs: any[] = await apiReq('GET', '/v1/organizations')
  if (orgs?.length) return orgs[0].id
  // Auto-create a default org on first use
  const org = await apiReq('POST', '/v1/organizations', { name: 'ForgeAI' })
  return org.id
}

function genPassword(len = 22): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

async function waitReady(ref: string, log?: Log, timeoutMs = 300_000): Promise<void> {
  const started = Date.now()
  let lastStatus = ''
  let lastBeat = started
  while (Date.now() - started < timeoutMs) {
    try {
      const p = await apiReq('GET', `/v1/projects/${ref}`)
      if (p.status === 'ACTIVE_HEALTHY') return
      if (p.status !== lastStatus) console.log(`[supabase] project ${ref} status: ${p.status} — waiting…`)
      lastStatus = p.status
    } catch { /* transient — keep polling */ }
    if (log && Date.now() - lastBeat >= 30_000) {
      lastBeat = Date.now()
      await log(`⏳ Supabase is still starting the database (${Math.round((Date.now() - started) / 1000)}s, status ${lastStatus || 'unknown'})…`)
    }
    await sleep(5000)
  }
  throw new Error(`Supabase project ${ref} not ready after ${timeoutMs / 1000}s`)
}

/** anon (legacy JWT) key when the project still has one, else the new publishable key. */
async function getClientKey(ref: string): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const keys: any[] = await apiReq('GET', `/v1/projects/${ref}/api-keys?reveal=true`)
      const anon = keys.find((k) => k.name === 'anon')?.api_key
      const publishable = keys.find((k) => k.type === 'publishable')?.api_key
      const key = anon || publishable
      if (key) return key
    } catch { /* keys appear a few seconds after the project turns healthy */ }
    await sleep(5000)
  }
  throw new Error(`Could not retrieve a client (anon/publishable) key for Supabase project ${ref}`)
}

/** Free orgs cap the number of active projects — this error means "use the shared project". */
function isProjectLimitError(e: any): boolean {
  return /maximum limits|free projects|project limit|limit of|upgrade your plan|exceeded/i.test(String(e?.message ?? ''))
}

/** Postgres identifier for a per-site schema in the shared project. */
export function siteSchemaName(slug: string): string {
  const s = `site_${slug.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`
  return s.slice(0, 60)
}

/** An existing healthy project that hosts many sites, one schema each. */
async function pickSharedProject(): Promise<string | null> {
  const forced = process.env.SUPABASE_SHARED_PROJECT_REF
  if (forced) return forced
  const projects: any[] = await apiReq('GET', '/v1/projects')
  const healthy = projects.filter((p) => p.status === 'ACTIVE_HEALTHY')
  const preferred = healthy.find((p) => /^forge-shared/.test(p.name)) ?? healthy.find((p) => /^forge-/.test(p.name)) ?? healthy[0]
  return preferred?.ref ?? null
}

/**
 * A database for one generated site. Prefers a dedicated project (full
 * isolation, its own auth users); when the org has hit its free-project limit
 * — the normal state after a couple of builds on the free plan — the site
 * gets its own schema inside a shared project instead, so a build never ends
 * without a working backend. SUPABASE_MODE=shared skips straight to that.
 */
export async function provisionSupabaseProject(slug: string, log?: Log): Promise<SupabaseCredentials> {
  const orgId = await getOrgId()
  const baseName = `forge-${slug}`.slice(0, 40).replace(/[^a-z0-9-]/gi, '-')

  let project: any = null
  let fallbackReason = ''
  if (process.env.SUPABASE_MODE === 'shared') {
    fallbackReason = 'SUPABASE_MODE=shared'
  } else {
    const attempts = [baseName, `${baseName.slice(0, 34)}-${Math.random().toString(36).slice(2, 6)}`]
    for (const name of attempts) {
      try {
        project = await apiReq('POST', '/v1/projects', {
          name,
          organization_id: orgId,
          region: process.env.SUPABASE_REGION ?? 'us-east-1',
          db_pass: genPassword(),
        })
        break
      } catch (e: any) {
        const msg: string = e.message ?? ''
        if (msg.includes('already exists') && name !== attempts[attempts.length - 1]) {
          console.warn(`[supabase] project name "${name}" taken — retrying with unique suffix`)
          continue
        }
        if (isProjectLimitError(e)) { fallbackReason = 'free-plan project limit reached'; break }
        throw e
      }
    }
  }

  if (!project) {
    const ref = await pickSharedProject()
    if (!ref) throw new Error(`No dedicated Supabase project could be created (${fallbackReason}) and there is no healthy project to share`)
    const schema = siteSchemaName(slug)
    console.log(`[supabase] ${fallbackReason} — hosting site in shared project ${ref}, schema ${schema}`)
    await log?.(`♻️ ${fallbackReason} — giving this site its own schema "${schema}" in your shared Supabase project`)
    await waitReady(ref, log)
    return { ref, url: `https://${ref}.supabase.co`, anonKey: await getClientKey(ref), schema, shared: true }
  }

  const ref: string = project.ref
  console.log(`[supabase] created project ${ref} — waiting for ACTIVE_HEALTHY…`)
  await waitReady(ref, log)
  return { ref, url: `https://${ref}.supabase.co`, anonKey: await getClientKey(ref), schema: 'public', shared: false }
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const TYPE_MAP: Record<string, string> = {
  text: 'text', string: 'text', varchar: 'text', char: 'text',
  integer: 'integer', int: 'integer', int4: 'integer', smallint: 'integer',
  bigint: 'bigint', int8: 'bigint',
  boolean: 'boolean', bool: 'boolean',
  uuid: 'uuid',
  timestamptz: 'timestamptz', timestamp: 'timestamptz', datetime: 'timestamptz',
  date: 'date',
  numeric: 'numeric', decimal: 'numeric', float: 'numeric', double: 'numeric', real: 'numeric', number: 'numeric',
  jsonb: 'jsonb', json: 'jsonb',
  'text[]': 'text[]',
}

const RESERVED_COLUMNS = new Set(['id', 'created_at', 'user_id'])

export function sqlType(type: string): string {
  return TYPE_MAP[String(type ?? '').toLowerCase().trim()] ?? 'text'
}

export function sqlIdent(name: string): string {
  return String(name).toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^([0-9])/, '_$1').slice(0, 60)
}

const q = (ident: string) => `"${ident.replace(/"/g, '')}"`

/** Normalise an AI table plan into something the SQL generator can trust. */
export function normalizeTables(raw: any[], hasAuth: boolean): SupabaseTable[] {
  const seen = new Set<string>()
  const out: SupabaseTable[] = []
  for (const t of Array.isArray(raw) ? raw : []) {
    const name = sqlIdent(t?.name ?? '')
    if (!name || seen.has(name)) continue
    seen.add(name)
    const cols: SupabaseColumn[] = []
    const colSeen = new Set<string>()
    for (const c of Array.isArray(t?.columns) ? t.columns : []) {
      const cn = sqlIdent(c?.name ?? '')
      if (!cn || RESERVED_COLUMNS.has(cn) || colSeen.has(cn)) continue
      colSeen.add(cn)
      cols.push({ name: cn, type: sqlType(c?.type), nullable: c?.nullable !== false })
    }
    if (!cols.length) cols.push({ name: 'title', type: 'text', nullable: false })
    let access: SupabaseAccess = ['public_read', 'public_write', 'auth_required'].includes(t?.access) ? t.access : 'public_write'
    // Without sign-in nobody could ever own a row — make it publicly writable instead.
    if (access === 'auth_required' && !hasAuth) access = 'public_write'
    out.push({ name, columns: cols.slice(0, 14), access })
  }
  return out
}

/** Every statement needed for the site's tables, fully schema-qualified, as a
 *  list — never re-split SQL on ';' (that breaks on any ';' inside a string). */
export function buildSupabaseStatements(tables: SupabaseTable[], schema: string): string[] {
  const s = q(schema)
  const stmts: string[] = []
  if (schema !== 'public') {
    stmts.push(`CREATE SCHEMA IF NOT EXISTS ${s}`)
    stmts.push(`GRANT USAGE ON SCHEMA ${s} TO anon, authenticated, service_role`)
  }
  for (const t of tables) {
    const tn = `${s}.${q(t.name)}`
    const cols = [
      `${q('id')} uuid PRIMARY KEY DEFAULT gen_random_uuid()`,
      `${q('created_at')} timestamptz NOT NULL DEFAULT now()`,
      ...(t.access === 'auth_required'
        ? [`${q('user_id')} uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE`]
        : []),
      ...t.columns.map((c) => `${q(c.name)} ${c.type}${c.nullable === false ? ' NOT NULL' : ''}`),
    ]
    stmts.push(`CREATE TABLE IF NOT EXISTS ${tn} (\n  ${cols.join(',\n  ')}\n)`)
    // Columns added to a table that already existed (re-run on the same schema)
    for (const c of t.columns) stmts.push(`ALTER TABLE ${tn} ADD COLUMN IF NOT EXISTS ${q(c.name)} ${c.type}`)
    stmts.push(`ALTER TABLE ${tn} ENABLE ROW LEVEL SECURITY`)
    stmts.push(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${tn} TO anon, authenticated`)
    stmts.push(`GRANT ALL ON ${tn} TO service_role`)
    const policy = (op: string, suffix: string, body: string) => {
      const pn = q(`${t.name}_${suffix}`)
      stmts.push(`DROP POLICY IF EXISTS ${pn} ON ${tn}`)
      stmts.push(`CREATE POLICY ${pn} ON ${tn} FOR ${op} ${body}`)
    }
    if (t.access === 'public_write') {
      policy('ALL', 'public_all', 'TO anon, authenticated USING (true) WITH CHECK (true)')
    } else if (t.access === 'public_read') {
      policy('SELECT', 'public_select', 'TO anon, authenticated USING (true)')
      policy('INSERT', 'auth_insert', 'TO authenticated WITH CHECK (true)')
      policy('UPDATE', 'auth_update', 'TO authenticated USING (true) WITH CHECK (true)')
      policy('DELETE', 'auth_delete', 'TO authenticated USING (true)')
    } else {
      policy('ALL', 'owner_all', 'TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)')
    }
  }
  return stmts
}

function sqlLiteral(v: unknown, type: string): string {
  if (v === null || v === undefined || v === '') return 'NULL'
  if (type === 'boolean') return /^(true|1|yes)$/i.test(String(v)) ? 'true' : 'false'
  if (type === 'integer' || type === 'bigint' || type === 'numeric') {
    const n = Number(v)
    return Number.isFinite(n) ? String(type === 'numeric' ? n : Math.round(n)) : 'NULL'
  }
  const str = (x: string) => `'${x.replace(/'/g, "''")}'`
  if (type === 'jsonb') return `${str(typeof v === 'string' ? v : JSON.stringify(v))}::jsonb`
  if (type === 'text[]') {
    const arr = Array.isArray(v) ? v : String(v).split(',').map((x) => x.trim())
    return `ARRAY[${arr.map((x) => str(String(x))).join(', ')}]::text[]`
  }
  return str(String(v))
}

/** INSERTs for starter rows (only public tables — owner-scoped rows would be invisible). */
export function buildSeedStatements(tables: SupabaseTable[], seed: SeedRows, schema: string): string[] {
  const stmts: string[] = []
  for (const t of tables) {
    if (t.access === 'auth_required') continue
    const rows = (seed[t.name] ?? []).filter((r) => r && typeof r === 'object').slice(0, 12)
    if (!rows.length) continue
    const cols = t.columns.filter((c) => rows.some((r) => r[c.name] !== undefined))
    if (!cols.length) continue
    const values = rows.map((r) => `(${cols.map((c) => sqlLiteral(r[c.name], c.type)).join(', ')})`)
    // Only seed an empty table, so a re-run never duplicates rows
    stmts.push(
      `INSERT INTO ${q(schema)}.${q(t.name)} (${cols.map((c) => q(c.name)).join(', ')}) ` +
      `SELECT * FROM (VALUES ${values.join(', ')}) AS v(${cols.map((c) => q(c.name)).join(', ')}) ` +
      `WHERE NOT EXISTS (SELECT 1 FROM ${q(schema)}.${q(t.name)})`,
    )
  }
  return stmts
}

async function runQuery(ref: string, query: string): Promise<any> {
  return apiReq('POST', `/v1/projects/${ref}/database/query`, { query }, 90_000)
}

/** Retries while a just-created database is still accepting connections. */
async function runQueryWithRetry(ref: string, query: string, attempts = 8): Promise<void> {
  let lastErr: any
  for (let i = 0; i < attempts; i++) {
    try { await runQuery(ref, query); return } catch (e: any) {
      lastErr = e
      const retryable = !(e instanceof SupabaseApiError) || e.status >= 500 || e.status === 429 || /connect|starting|timeout|terminat/i.test(e.message)
      if (!retryable) throw e
      await sleep(Math.min(5000 * (i + 1), 20_000))
    }
  }
  throw lastErr
}

/** Make a non-public schema reachable through the REST API (PostgREST). */
async function exposeSchema(ref: string, schema: string): Promise<void> {
  const cfg = await apiReq('GET', `/v1/projects/${ref}/postgrest`)
  const current = String(cfg?.db_schema ?? 'public,graphql_public').split(',').map((s) => s.trim()).filter(Boolean)
  if (current.includes(schema)) return
  await apiReq('PATCH', `/v1/projects/${ref}/postgrest`, { db_schema: [...current, schema].join(',') })
}

/** Generated sites have no email setup — let sign-ups log in immediately. */
async function enableInstantSignup(ref: string): Promise<void> {
  try {
    await apiReq('PATCH', `/v1/projects/${ref}/config/auth`, { mailer_autoconfirm: true })
  } catch (e: any) {
    console.warn(`[supabase] could not enable auto-confirm on ${ref}: ${e.message}`)
  }
}

/** Ask the REST API for one row of every table — the exact call the site makes. */
async function smokeTest(creds: SupabaseCredentials, tables: SupabaseTable[]): Promise<string[]> {
  const failing: string[] = []
  for (const t of tables) {
    const res = await fetch(`${creds.url}/rest/v1/${t.name}?select=id&limit=1`, {
      headers: {
        apikey: creds.anonKey,
        ...(creds.anonKey.startsWith('eyJ') ? { Authorization: `Bearer ${creds.anonKey}` } : {}),
        'Accept-Profile': creds.schema,
      },
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null)
    if (!res?.ok) failing.push(`${t.name} (${res?.status ?? 'network error'}${res ? `: ${(await res.text()).slice(0, 120)}` : ''})`)
  }
  return failing
}

export interface MigrationResult { ok: boolean; errors: string[] }

/**
 * Create the site's tables, RLS policies and starter rows, then prove the REST
 * API serves every table to the anon key. Errors are returned, not swallowed —
 * a site whose tables never got created must not be reported as live.
 */
export async function runSupabaseMigrations(
  creds: SupabaseCredentials,
  tables: SupabaseTable[],
  opts: { seed?: SeedRows; hasAuth?: boolean; log?: Log } = {},
): Promise<MigrationResult> {
  const { seed = {}, hasAuth = false, log } = opts
  const ddl = buildSupabaseStatements(tables, creds.schema)
  const seedStmts = buildSeedStatements(tables, seed, creds.schema)
  const errors: string[] = []

  try {
    // One round-trip, all-or-nothing, when everything is valid
    await runQueryWithRetry(creds.ref, `BEGIN;\n${ddl.join(';\n')};\nCOMMIT;`)
  } catch (e: any) {
    console.warn(`[supabase] batch migration failed (${e.message}) — retrying statement by statement`)
    for (const stmt of ddl) {
      try { await runQueryWithRetry(creds.ref, stmt, 3) } catch (err: any) {
        errors.push(`${stmt.split('\n')[0].slice(0, 90)} — ${String(err.message).slice(0, 200)}`)
      }
    }
  }
  for (const stmt of seedStmts) {
    try { await runQueryWithRetry(creds.ref, stmt, 3) } catch (err: any) {
      console.warn(`[supabase] seed failed (non-fatal): ${String(err.message).slice(0, 200)}`)
    }
  }

  if (creds.schema !== 'public') {
    try { await exposeSchema(creds.ref, creds.schema) } catch (e: any) { errors.push(`expose schema: ${e.message}`) }
  }
  if (hasAuth) await enableInstantSignup(creds.ref)
  try { await runQuery(creds.ref, `NOTIFY pgrst, 'reload config'; NOTIFY pgrst, 'reload schema';`) } catch { /* best-effort */ }

  // PostgREST picks up new tables/schemas within a few seconds — poll for it.
  let failing: string[] = []
  for (let i = 0; i < 12; i++) {
    failing = await smokeTest(creds, tables)
    if (!failing.length) break
    if (i === 3) await log?.('⏳ Waiting for the Supabase REST API to pick up the new tables…')
    await sleep(5000)
  }
  if (failing.length) errors.push(`REST API cannot read: ${failing.join(', ')}`)
  return { ok: errors.length === 0, errors }
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_ACCESS_TOKEN)
}
