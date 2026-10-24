const SUPABASE_API = 'https://api.supabase.com'

export interface SupabaseCredentials {
  ref: string
  url: string
  anonKey: string
}

function getToken(): string {
  const t = process.env.SUPABASE_ACCESS_TOKEN
  if (!t) throw new Error('SUPABASE_ACCESS_TOKEN not set — add it to .env to use Supabase mode')
  return t
}

async function apiReq(method: string, endpoint: string, body?: object): Promise<any> {
  const res = await fetch(`${SUPABASE_API}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Supabase API ${method} ${endpoint} → ${res.status}: ${text.slice(0, 300)}`)
  return JSON.parse(text)
}

async function getOrgId(): Promise<string> {
  const orgs: any[] = await apiReq('GET', '/v1/organizations')
  if (!orgs?.length) throw new Error('No Supabase organizations found. Create one at supabase.com first.')
  return orgs[0].id
}

function genPassword(len = 22): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

async function waitReady(ref: string, timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const p = await apiReq('GET', `/v1/projects/${ref}`)
      if (p.status === 'ACTIVE_HEALTHY') return
      console.log(`[supabase] project ${ref} status: ${p.status} — waiting…`)
    } catch {}
    await new Promise(r => setTimeout(r, 5000))
  }
  throw new Error(`Supabase project ${ref} not ready after ${timeoutMs / 1000}s`)
}

export async function provisionSupabaseProject(slug: string): Promise<SupabaseCredentials> {
  const orgId = await getOrgId()
  const name = `forge-${slug}`.slice(0, 40).replace(/[^a-z0-9-]/gi, '-')

  const project = await apiReq('POST', '/v1/projects', {
    name,
    organization_id: orgId,
    plan: 'free',
    region: 'us-east-1',
    db_pass: genPassword(),
  })

  const ref: string = project.ref
  console.log(`[supabase] created project ${ref} — waiting for ACTIVE_HEALTHY…`)
  await waitReady(ref)

  const keys: any[] = await apiReq('GET', `/v1/projects/${ref}/api-keys`)
  const anonKey = keys.find((k: any) => k.name === 'anon')?.api_key ?? ''
  if (!anonKey) throw new Error(`Could not retrieve anon key for Supabase project ${ref}`)

  return { ref, url: `https://${ref}.supabase.co`, anonKey }
}

export async function runSupabaseMigrations(ref: string, sql: string): Promise<void> {
  const stmts = sql
    .replace(/--[^\n]*/g, '')   // strip SQL comments
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)

  for (const stmt of stmts) {
    try {
      await apiReq('POST', `/v1/projects/${ref}/database/query`, { query: stmt + ';' })
    } catch (e: any) {
      console.warn(`[supabase] migration stmt failed (non-fatal): ${stmt.slice(0, 80)} — ${e.message}`)
    }
  }
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_ACCESS_TOKEN)
}
