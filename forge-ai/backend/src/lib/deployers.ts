// Real deployment engine for Blitz Deploy.
// Takes the prepared repo and pushes it live on the chosen platform,
// returning the URL of the deployed site.
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import simpleGit from 'simple-git'

export interface DeployResult {
  url: string
  dashboardUrl?: string
  /** persisted on the repository; passed back as `existing` on the next run */
  state?: Record<string, any>
}

export type DeployLog = (message: string, level?: 'info' | 'warn' | 'error') => Promise<void>

export interface DeployInput {
  localPath: string
  token: string
  /** e.g. "owner/repo" — used by platforms that build from GitHub */
  repoFullName: string
  /** branch containing the generated deploy configs (pushed before deploying) */
  branch: string
  name: string
  /** whether a Dockerfile exists on `branch` as it is on GitHub */
  remoteHasDockerfile?: boolean
  /** deploy state saved from a previous run of this repo+platform */
  existing?: Record<string, any>
  /** environment variables to set on the deployed service (e.g. MONGODB_URI) */
  envVars?: { key: string; value: string }[]
}

export const PLATFORMS_NEEDING_TOKEN = new Set(['vercel', 'railway', 'render'])

// ─── Custom domains (Render) ───────────────────────────────
// Point a brand's own domain at their deployed site. Render issues the TLS
// certificate automatically once DNS resolves, so the only manual step is the
// DNS record the client adds at their registrar — which we spell out for them.

/** Render's A-record target for apex domains. Render documents a single anycast
 *  IP; if they ever change it the dashboard shows the current value. */
const RENDER_APEX_IP = '216.24.57.1'

export interface CustomDomainRecord {
  id?: string
  name: string
  verified: boolean
  /** the exact DNS record the client must create at their registrar */
  dns: { type: 'A' | 'CNAME'; host: string; value: string }
}

// Multi-part public suffixes: "brand.co.uk" is an APEX domain even though it has
// three labels, so a naive label count would hand the client a wrong DNS record.
const MULTI_PART_TLDS = [
  'co.uk', 'org.uk', 'me.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au',
  'co.nz', 'co.za', 'com.br', 'com.mx', 'co.in', 'co.jp', 'com.pk', 'com.sg',
  'com.tr', 'com.cn', 'co.kr', 'com.ar', 'com.co',
]

/** apex ("brand.com", "brand.co.uk") needs an A record; a subdomain uses CNAME. */
export function dnsRecordFor(domain: string, serviceHost: string): CustomDomainRecord['dns'] {
  const labels = domain.toLowerCase().split('.').filter(Boolean)
  const suffix = labels.slice(-2).join('.')
  const apexLabelCount = MULTI_PART_TLDS.includes(suffix) ? 3 : 2
  const isApex = labels.length <= apexLabelCount
  return isApex
    ? { type: 'A', host: '@', value: RENDER_APEX_IP }
    : { type: 'CNAME', host: labels.slice(0, labels.length - apexLabelCount).join('.'), value: serviceHost }
}

const renderHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
})

/** Attach a custom domain to a Render service. Idempotent: an already-added
 *  domain resolves to its existing record instead of erroring. */
export async function addRenderDomain(
  serviceId: string, token: string, domain: string, serviceHost: string,
): Promise<CustomDomainRecord> {
  const dns = dnsRecordFor(domain, serviceHost)
  try {
    const { data } = await axios.post(
      `${RENDER_API}/services/${serviceId}/custom-domains`,
      { name: domain },
      { headers: renderHeaders(token) },
    )
    const d = Array.isArray(data) ? data[0]?.customDomain ?? data[0] : data?.customDomain ?? data
    return { id: d?.id, name: d?.name ?? domain, verified: d?.verificationStatus === 'verified', dns }
  } catch (err: any) {
    // Already attached → return the existing record rather than failing
    if (err.response?.status === 409 || /already/i.test(err.response?.data?.message ?? '')) {
      const existing = (await listRenderDomains(serviceId, token)).find((x) => x.name === domain)
      if (existing) return existing
    }
    throw new Error(err.response?.data?.message ?? err.message ?? 'Render rejected the domain')
  }
}

export async function listRenderDomains(serviceId: string, token: string): Promise<CustomDomainRecord[]> {
  const { data } = await axios.get(
    `${RENDER_API}/services/${serviceId}/custom-domains?limit=50`,
    { headers: renderHeaders(token) },
  )
  return (data ?? []).map((row: any) => {
    const d = row?.customDomain ?? row
    return {
      id: d?.id,
      name: d?.name,
      verified: d?.verificationStatus === 'verified',
      dns: dnsRecordFor(d?.name ?? '', ''),
    }
  }).filter((d: CustomDomainRecord) => d.name)
}

/** Ask Render to re-check DNS for a domain (after the client adds the record). */
export async function verifyRenderDomain(serviceId: string, token: string, domainId: string): Promise<boolean> {
  try {
    await axios.post(
      `${RENDER_API}/services/${serviceId}/custom-domains/${domainId}/verify`,
      {}, { headers: renderHeaders(token) },
    )
  } catch { /* verification is best-effort; the status read below is the truth */ }
  try {
    const { data } = await axios.get(
      `${RENDER_API}/services/${serviceId}/custom-domains/${domainId}`,
      { headers: renderHeaders(token) },
    )
    const d = data?.customDomain ?? data
    return d?.verificationStatus === 'verified'
  } catch { return false }
}

export async function removeRenderDomain(serviceId: string, token: string, domainId: string): Promise<void> {
  await axios.delete(
    `${RENDER_API}/services/${serviceId}/custom-domains/${domainId}`,
    { headers: renderHeaders(token) },
  )
}

// Env vars simple-git's unsafe-operations check refuses to spawn with when an
// env is passed explicitly (they can also hang a headless server on prompts)
const UNSAFE_GIT_ENV = new Set([
  'editor', 'pager', 'prefix', 'git_askpass', 'ssh_askpass',
  'git_config', 'git_config_global', 'git_config_system', 'git_config_count',
  'git_editor', 'git_sequence_editor', 'git_exec_path', 'git_external_diff',
  'git_pager', 'git_proxy_command', 'git_template_dir', 'git_ssh', 'git_ssh_command',
])

/** Environment for spawned git: non-interactive, credential prompts disabled. */
export function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  for (const key of Object.keys(env)) {
    if (UNSAFE_GIT_ENV.has(key.toLowerCase())) delete env[key]
  }
  return env
}

/** Server-wide platform tokens: deploys run on the product's own account,
 *  so end users get one-press deploys with no token prompt. */
export function getEnvToken(platform: string): string | undefined {
  const map: Record<string, string | undefined> = {
    vercel: process.env.VERCEL_TOKEN,
    railway: process.env.RAILWAY_TOKEN,
    render: process.env.RENDER_TOKEN,
  }
  return map[platform] || undefined
}

/**
 * Find the real GitHub "owner/repo" for a folder from its git remotes.
 * Local-folder workspaces have a synthetic fullName ("local/<name>"), which
 * GitHub-building platforms (Render, Railway) cannot fetch.
 */
export async function detectGitHubRemote(
  localPath: string,
): Promise<{ fullName: string; branch?: string } | null> {
  try {
    const git = simpleGit(localPath)
    if (!(await git.checkIsRepo())) return null
    const remotes = await git.getRemotes(true)
    // Prefer origin; fall back to any GitHub remote
    const sorted = [...remotes].sort((a, b) => (a.name === 'origin' ? -1 : b.name === 'origin' ? 1 : 0))
    for (const remote of sorted) {
      const url = remote.refs.fetch || remote.refs.push || ''
      // Matches https://github.com/o/r(.git), https://token@github.com/o/r, git@github.com:o/r.git
      const m = url.match(/github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/)
      if (m) {
        let branch: string | undefined
        try { branch = (await git.branchLocal()).current || undefined } catch {}
        return { fullName: `${m[1]}/${m[2]}`, branch }
      }
    }
    return null
  } catch {
    return null
  }
}

/** Resolve 'auto' to a concrete platform based on the project stack. */
export function detectAutoPlatform(localPath: string): 'vercel' | 'railway' {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(localPath, 'package.json'), 'utf-8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    const frontend = ['next', 'vite', 'react-scripts', 'astro', '@sveltejs/kit', 'nuxt', 'gatsby', '@remix-run/react', '@angular/core']
    if (frontend.some((d) => deps?.[d])) return 'vercel'
  } catch {}
  // Backends and non-node stacks: Railway builds nearly anything via Nixpacks
  return 'railway'
}

export async function deploy(platform: string, input: DeployInput, log: DeployLog): Promise<DeployResult> {
  switch (platform) {
    case 'vercel':  return deployToVercel(input, log)
    case 'railway': return deployToRailway(input, log)
    case 'render':  return deployToRender(input, log)
    default: throw new Error(`Platform "${platform}" does not support direct deployment`)
  }
}

// ─── Vercel ────────────────────────────────────────────────
// Uploads the project files directly; Vercel builds in the cloud
// and the deployment URL is live as soon as the build finishes.

const VERCEL_API = 'https://api.vercel.com'
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out', '__pycache__', 'venv', '.venv', 'coverage', '.turbo', '.vercel'])
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_TOTAL_BYTES = 20 * 1024 * 1024

function collectFiles(root: string): { file: string; data: string; encoding: 'base64' }[] {
  const files: { file: string; data: string; encoding: 'base64' }[] = []
  let total = 0
  function walk(dir: string) {
    let items: fs.Dirent[]
    try { items = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const item of items) {
      if (SKIP_DIRS.has(item.name)) continue
      const full = path.join(dir, item.name)
      if (item.isDirectory()) { walk(full); continue }
      if (!item.isFile()) continue
      let stat: fs.Stats
      try { stat = fs.statSync(full) } catch { continue }
      if (stat.size > MAX_FILE_BYTES) continue
      total += stat.size
      if (total > MAX_TOTAL_BYTES) throw new Error('Project is too large to upload directly (>20MB of source). Try Railway or Render instead.')
      files.push({
        file: path.relative(root, full).split(path.sep).join('/'),
        data: fs.readFileSync(full).toString('base64'),
        encoding: 'base64',
      })
    }
  }
  walk(root)
  return files
}

function detectVercelFramework(localPath: string): string | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(localPath, 'package.json'), 'utf-8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    if (deps['next']) return 'nextjs'
    if (deps['nuxt']) return 'nuxtjs'
    if (deps['@sveltejs/kit']) return 'sveltekit'
    if (deps['astro']) return 'astro'
    if (deps['@remix-run/react']) return 'remix'
    if (deps['gatsby']) return 'gatsby'
    if (deps['@angular/core']) return 'angular'
    if (deps['react-scripts']) return 'create-react-app'
    if (deps['vite']) return 'vite'
  } catch {}
  return null
}

function sanitizeName(name: string): string {
  const clean = name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90)
  return clean || 'forgeai-app'
}

async function deployToVercel({ localPath, token, name }: DeployInput, log: DeployLog): Promise<DeployResult> {
  const headers = { Authorization: `Bearer ${token}` }
  const files = collectFiles(localPath)
  await log(`Uploading ${files.length} files to Vercel…`)

  const framework = detectVercelFramework(localPath)
  const projectName = sanitizeName(name)

  const { data: dep } = await axios.post(
    `${VERCEL_API}/v13/deployments?forceNew=1`,
    {
      name: projectName,
      files,
      target: 'production',
      projectSettings: { framework },
    },
    { headers, maxBodyLength: Infinity },
  ).catch(rethrowApiError('Vercel'))

  await log(`Vercel is building your project (deployment ${dep.id})…`)

  // Poll until the build finishes
  const deadline = Date.now() + 8 * 60 * 1000
  let state = dep.readyState
  while (state !== 'READY' && state !== 'ERROR' && state !== 'CANCELED') {
    if (Date.now() > deadline) throw new Error('Vercel build timed out after 8 minutes — check your Vercel dashboard')
    await sleep(5000)
    const { data } = await axios.get(`${VERCEL_API}/v13/deployments/${dep.id}`, { headers }).catch(rethrowApiError('Vercel'))
    if (data.readyState !== state) {
      state = data.readyState
      await log(`Vercel build status: ${state}`)
    }
  }
  if (state !== 'READY') throw new Error(`Vercel build failed (${state}) — open your Vercel dashboard for build logs`)

  // Prefer the shortest production alias (e.g. "hra.vercel.app") over the
  // long unique deployment URL (e.g. "hra-27hax2jfx-abdulrehmans-...").
  // Vercel returns `alias` populated on production deploys — pick the shortest.
  let finalUrl = `https://${dep.url}`
  try {
    const { data: full } = await axios.get(`${VERCEL_API}/v13/deployments/${dep.id}`, { headers })
    const aliases: string[] = Array.isArray(full?.alias) ? full.alias : []
    if (aliases.length) {
      const shortest = aliases.slice().sort((a, b) => a.length - b.length)[0]
      finalUrl = `https://${shortest}`
    }
  } catch { /* fall back to unique deployment URL */ }

  // Warn if the project is behind Deployment Protection — the site will work
  // for the account owner but 403 for everyone else, which reads as "broken
  // deploy" when it's actually an auth gate.
  try {
    const { data: proj } = await axios.get(`${VERCEL_API}/v9/projects/${projectName}`, { headers })
    const protection =
      proj?.ssoProtection ?? proj?.passwordProtection ?? proj?.deploymentProtection
    if (protection) {
      await log(
        '⚠️ Vercel Deployment Protection is ON for this project — the site will 403 for anyone not logged into your Vercel account. Turn it off at: Project → Settings → Deployment Protection → Vercel Authentication → Disabled',
        'warn',
      )
    }
  } catch { /* best-effort */ }

  // Vercel is naturally idempotent: same project name → new deployment on it
  return {
    url: finalUrl,
    dashboardUrl: `https://vercel.com/deployments/${dep.id}`,
    state: { projectName },
  }
}

// ─── Railway ───────────────────────────────────────────────
// Creates a project + service from the GitHub repo; Railway builds it
// with Nixpacks (or the generated Dockerfile) and we attach a public domain.

const RAILWAY_API = 'https://backboard.railway.app/graphql/v2'

async function railwayGql(token: string, query: string, variables: Record<string, any>): Promise<any> {
  const { data } = await axios.post(
    RAILWAY_API,
    { query, variables },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
  ).catch(rethrowApiError('Railway'))
  if (data.errors?.length) throw new Error(`Railway: ${data.errors.map((e: any) => e.message).join('; ')}`)
  return data.data
}

async function deployToRailway({ token, repoFullName, name, existing }: DeployInput, log: DeployLog): Promise<DeployResult> {
  // ── Reuse: redeploy the service from a previous run instead of duplicating ──
  if (existing?.serviceId && existing?.environmentId && existing?.domain) {
    try {
      await railwayGql(token, `
        mutation($environmentId: String!, $serviceId: String!) {
          serviceInstanceRedeploy(environmentId: $environmentId, serviceId: $serviceId)
        }`, { environmentId: existing.environmentId, serviceId: existing.serviceId })
      await log('Found existing Railway service — redeploying…')
      return {
        url: `https://${existing.domain}`,
        dashboardUrl: `https://railway.app/project/${existing.projectId}`,
        state: existing,
      }
    } catch {
      await log('Previous Railway service is gone — creating a fresh one', 'warn')
    }
  }

  await log('Creating Railway project…')
  const projectData = await railwayGql(token, `
    mutation($name: String) {
      projectCreate(input: { name: $name }) {
        id
        environments { edges { node { id name } } }
      }
    }`, { name: sanitizeName(name) })

  const project = projectData.projectCreate
  const environmentId = project.environments.edges[0]?.node?.id
  if (!environmentId) throw new Error('Railway project has no environment')

  await log(`Connecting GitHub repo ${repoFullName} to Railway…`)
  const serviceData = await railwayGql(token, `
    mutation($projectId: String!, $repo: String!) {
      serviceCreate(input: { projectId: $projectId, source: { repo: $repo } }) { id }
    }`, { projectId: project.id, repo: repoFullName })

  await log('Generating public domain…')
  const domainData = await railwayGql(token, `
    mutation($environmentId: String!, $serviceId: String!) {
      serviceDomainCreate(input: { environmentId: $environmentId, serviceId: $serviceId }) { domain }
    }`, { environmentId, serviceId: serviceData.serviceCreate.id })

  await log('Railway is building your app — it will be live at the domain in a few minutes')
  return {
    url: `https://${domainData.serviceDomainCreate.domain}`,
    dashboardUrl: `https://railway.app/project/${project.id}`,
    state: {
      projectId: project.id,
      environmentId,
      serviceId: serviceData.serviceCreate.id,
      domain: domainData.serviceDomainCreate.domain,
    },
  }
}

// ─── Render ────────────────────────────────────────────────
// Creates a web service from the GitHub repo. Uses the generated
// Dockerfile (pushed to the blitz branch) when available.

const RENDER_API = 'https://api.render.com/v1'

async function deployToRender({ localPath, token, repoFullName, branch, name, remoteHasDockerfile, existing, envVars }: DeployInput, log: DeployLog): Promise<DeployResult> {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  // Merge env vars into a service, preserving anything set by hand on Render
  const applyEnvVars = async (serviceId: string) => {
    if (!envVars?.length) return
    try {
      const current: { key: string; value: string }[] = await axios
        .get(`${RENDER_API}/services/${serviceId}/env-vars?limit=100`, { headers })
        .then((r) => (r.data ?? []).map((x: any) => x.envVar ?? x).filter((v: any) => v?.key))
        .catch(() => [])
      const merged = [
        ...current.filter((v) => !envVars.some((e) => e.key === v.key)).map((v) => ({ key: v.key, value: v.value })),
        ...envVars,
      ]
      await axios.put(`${RENDER_API}/services/${serviceId}/env-vars`, merged, { headers })
      await log(`Set ${envVars.map((e) => e.key).join(', ')} on the Render service`)
    } catch (err: any) {
      await log(`Could not set env vars on Render: ${err.response?.data?.message ?? err.message}`, 'warn')
    }
  }

  // ── Reuse: redeploy the service from a previous run instead of colliding ──
  let serviceName = sanitizeName(name)
  let service: any
  if (existing?.serviceId) {
    service = await axios.get(`${RENDER_API}/services/${existing.serviceId}`, { headers })
      .then((r) => r.data)
      .catch(() => undefined) // deleted on Render → fall through and create fresh
  }
  if (!service) {
    // Service may exist from before ForgeAI tracked state — find it by name
    const found = await axios.get(`${RENDER_API}/services?name=${encodeURIComponent(serviceName)}&limit=20`, { headers })
      .then((r) => (r.data ?? []).map((x: any) => x.service ?? x).find((s: any) => s?.name === serviceName))
      .catch(() => undefined)
    if (found && `${found.repo}`.toLowerCase().includes(repoFullName.toLowerCase())) {
      service = found
    } else if (found) {
      // Name taken by an unrelated service on this account — pick a unique name
      serviceName = `${serviceName}-${Math.random().toString(36).slice(2, 6)}`
    }
  }

  if (service) {
    await log(`Found existing Render service "${service.name}" — redeploying…`)
    // Point it at the branch with the freshly generated configs (best effort)
    if (service.branch !== branch) {
      await axios.patch(`${RENDER_API}/services/${service.id}`, { branch }, { headers }).catch(() => {})
    }
    await applyEnvVars(service.id)
    await axios.post(`${RENDER_API}/services/${service.id}/deploys`, {}, { headers }).catch(rethrowApiError('Render'))
    const url = service.serviceDetails?.url
    if (!url) throw new Error('Render redeploy started but the service has no URL — check your Render dashboard')
    await log('Render is rebuilding your app — the URL updates when the build finishes')
    return {
      url,
      dashboardUrl: `https://dashboard.render.com/${service.type === 'static_site' ? 'static' : 'web'}/${service.id}`,
      state: { serviceId: service.id, url },
    }
  }

  const { data: owners } = await axios.get(`${RENDER_API}/owners?limit=1`, { headers }).catch(rethrowApiError('Render'))
  const ownerId = owners?.[0]?.owner?.id
  if (!ownerId) throw new Error('Render: could not find an owner/workspace for this API key')

  // A plain static site (index.html, no server code, no package.json) MUST
  // deploy as Render Static Site, NOT Docker. Static sites are free and
  // unlimited on Render; Docker web services burn from a 750-hour/month cap
  // shared across the whole account, so deploying every generated site as
  // Docker suspends the entire account once a handful accumulate. We check
  // this BEFORE the Dockerfile branch so blitzDeploy's Dockerfile — meant for
  // Docker Hub / Railway / other targets — cannot force us onto a paid path
  // for what Render already serves for free.
  const isPlainStatic =
    fs.existsSync(path.join(localPath, 'index.html')) &&
    !fs.existsSync(path.join(localPath, 'package.json')) &&
    !fs.existsSync(path.join(localPath, 'server', 'index.js'))

  let type = 'web_service'
  let serviceDetails: Record<string, any>
  let runtimeLabel: string
  if (isPlainStatic) {
    type = 'static_site'
    serviceDetails = { publishPath: '.' }
    runtimeLabel = 'static site (free, no hour cap)'
  } else if (remoteHasDockerfile) {
    serviceDetails = { plan: 'free', runtime: 'docker' }
    runtimeLabel = 'Docker'
  } else if (fs.existsSync(path.join(localPath, 'package.json'))) {
    const pkg = JSON.parse(fs.readFileSync(path.join(localPath, 'package.json'), 'utf-8'))
    serviceDetails = {
      plan: 'free',
      runtime: 'node',
      envSpecificDetails: {
        buildCommand: pkg.scripts?.build ? 'npm install && npm run build' : 'npm install',
        startCommand: pkg.scripts?.start ? 'npm start' : `node ${pkg.main ?? 'index.js'}`,
      },
    }
    runtimeLabel = 'Node'
  } else {
    throw new Error('Render deploy needs a Dockerfile, a Node project, or a static site — try Railway for other stacks')
  }

  await log(`Creating Render ${type === 'static_site' ? 'static site' : 'web service'} from ${repoFullName} (${runtimeLabel}, branch ${branch})…`)
  // Retry with random suffix on "name already in use". Belt-and-suspenders:
  // the search-by-name reuse logic above should have caught this, but if it
  // misses (stale DB state, race, Render pagination), the create call
  // itself must not hard-fail — auto-suffix and try again.
  const tryCreate = async (attemptName: string) => axios.post(
    `${RENDER_API}/services`,
    {
      type,
      name: attemptName,
      ownerId,
      repo: `https://github.com/${repoFullName}`,
      branch,
      autoDeploy: 'yes',
      serviceDetails,
      ...(envVars?.length && type !== 'static_site' ? { envVars } : {}),
    },
    { headers },
  )
  let data: any
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await tryCreate(serviceName)
      data = res.data
      break
    } catch (err: any) {
      const status = err.response?.status
      const msg = String(err.response?.data?.message ?? err.response?.data?.error ?? '').toLowerCase()
      const nameCollision = status === 400 && (msg.includes('already in use') || msg.includes('already exists') || msg.includes('name is taken'))
      if (nameCollision && attempt < 2) {
        const oldName = serviceName
        serviceName = `${sanitizeName(name)}-${Math.random().toString(36).slice(2, 6)}`
        await log(`Render service "${oldName}" already exists — retrying with unique name "${serviceName}"`, 'warn')
        continue
      }
      rethrowApiError('Render')(err)
    }
  }
  if (!data) throw new Error('Render: failed to create service after 3 name-collision retries')

  const url = data?.service?.serviceDetails?.url
  if (!url) throw new Error('Render created the service but returned no URL — check your Render dashboard')

  await log('Render is building your app — it will be live at the URL in a few minutes')
  return {
    url,
    dashboardUrl: `https://dashboard.render.com/${type === 'static_site' ? 'static' : 'web'}/${data.service.id}`,
    state: { serviceId: data.service.id, url },
  }
}

// ─── Render auto-redeploy ──────────────────────────────────
// Called after the agent changes files in a repo that was previously
// deployed to Render: push the changes to the branch the service builds
// from and trigger a rebuild, so the live site updates automatically.

export interface RedeployRenderInput {
  localPath: string
  token: string
  serviceId: string
  /** where to push — 'origin' or a token-authenticated GitHub URL */
  pushRemote: string
  /** stage only these paths (local folders); omit to stage everything */
  changedPaths?: string[]
  commitMessage: string
}

export async function redeployRender(
  { localPath, token, serviceId, pushRemote, changedPaths, commitMessage }: RedeployRenderInput,
  log: DeployLog,
): Promise<{ url?: string; dashboardUrl: string }> {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const service = await axios.get(`${RENDER_API}/services/${serviceId}`, { headers })
    .then((r) => r.data)
    .catch(() => undefined)
  if (!service) throw new Error('The Render service from the previous deploy no longer exists — run Blitz Deploy again')

  const git = simpleGit(localPath).env(gitEnv())
  if (!(await git.checkIsRepo())) throw new Error('Workspace is not a git repository')

  // Build the commit with plumbing commands (write-tree/commit-tree) so the
  // user's checked-out branch and working tree are never touched — a branch
  // switch here would wipe the agent's edits out of a local folder.
  await git.addConfig('user.name', 'ForgeAI')
  await git.addConfig('user.email', 'bot@forgeai.dev')
  if (changedPaths?.length) await git.add(changedPaths)
  else await git.add('.')
  const treeSha = (await git.raw(['write-tree'])).trim()
  const parentSha = (await git.revparse(['HEAD'])).trim()
  const commitSha = (await git.raw(['commit-tree', treeSha, '-p', parentSha, '-m', commitMessage])).trim()

  const pushCommit = (branch: string, force: boolean) =>
    git.push(force
      ? [pushRemote, `+${commitSha}:refs/heads/${branch}`]
      : [pushRemote, `${commitSha}:refs/heads/${branch}`])

  // ForgeAI-owned branches can be force-pushed; user branches are pushed
  // normally, falling back to a ForgeAI branch (re-pointing the service)
  // when the push is rejected (stale clone, protected branch, …)
  const serviceBranch: string = service.branch || 'main'
  await log(`Pushing changes to ${serviceBranch}…`)
  try {
    await pushCommit(serviceBranch, serviceBranch.startsWith('forgeai/'))
  } catch {
    const fallback = 'forgeai/agent-deploy'
    await log(`Could not push to "${serviceBranch}" — deploying from ${fallback} instead`, 'warn')
    await pushCommit(fallback, true)
    await axios.patch(`${RENDER_API}/services/${serviceId}`, { branch: fallback }, { headers }).catch(() => {})
  }

  await axios.post(`${RENDER_API}/services/${serviceId}/deploys`, {}, { headers }).catch(rethrowApiError('Render'))

  const url = service.serviceDetails?.url
  await log(`Render is rebuilding your app${url ? ` — ${url} updates when the build finishes` : ''}`)
  return {
    url,
    dashboardUrl: `https://dashboard.render.com/${service.type === 'static_site' ? 'static' : 'web'}/${serviceId}`,
  }
}

// ─── helpers ───────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function rethrowApiError(platform: string) {
  return (err: any): never => {
    const status = err.response?.status
    const apiMsg =
      err.response?.data?.error?.message ??
      err.response?.data?.message ??
      (typeof err.response?.data === 'string' ? err.response.data.slice(0, 200) : undefined)
    if (status === 401 || status === 403) {
      throw new Error(`${platform}: token was rejected (${status}) — generate a new token and try again`)
    }
    throw new Error(`${platform}: ${apiMsg ?? err.message}${status ? ` (HTTP ${status})` : ''}`)
  }
}
