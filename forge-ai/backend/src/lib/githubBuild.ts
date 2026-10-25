/**
 * Build a site on GitHub Actions (7GB RAM, free for public repos) and
 * return a local directory containing the built dist/ output.
 *
 * Flow:
 *  1. Set VITE_* vars as GitHub repo variables (unencrypted API call)
 *  2. Write + commit + push .github/workflows/forgeai-deploy.yml
 *  3. Poll the Actions API until the workflow run completes (≤10 min)
 *  4. Download the dist artifact zip from the GitHub API
 *  5. Extract it to a temp dir and return that path
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import axios from 'axios'
import AdmZip from 'adm-zip'

const execAsync = promisify(exec)

const GH_API = 'https://api.github.com'

function ghHeaders(token: string) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

/** Set a GitHub repo variable (plain-text, not encrypted unlike Secrets). */
async function setRepoVariable(owner: string, repo: string, name: string, value: string, token: string) {
  // Try update first (PUT for existing), fall back to create (POST for new)
  try {
    await axios.patch(
      `${GH_API}/repos/${owner}/${repo}/actions/variables/${name}`,
      { name, value },
      { headers: ghHeaders(token) },
    )
  } catch (e: any) {
    if (e.response?.status === 404) {
      await axios.post(
        `${GH_API}/repos/${owner}/${repo}/actions/variables`,
        { name, value },
        { headers: ghHeaders(token) },
      )
    } else {
      throw e
    }
  }
}

/** Generate the workflow YAML that builds the site and uploads a dist/ artifact. */
function workflowYaml(envVarNames: string[], triggerToken: string): string {
  const envLines = envVarNames
    .map(n => `          ${n}: \${{ vars.${n} }}`)
    .join('\n')
  return `name: ForgeAI Deploy
# trigger-token: ${triggerToken}
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install deps
        run: npm install --legacy-peer-deps
      - name: Build
        run: npm run build
        env:
${envLines || '          NODE_ENV: production'}
      - name: Upload dist
        uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
          retention-days: 1
`
}

/**
 * Called when the GitHub Actions build fails.
 * Receives the last ~4KB of the job log.  Should fix source files in `localPath`
 * and return true to retry the build, or false to give up.
 */
export type OnBuildError = (log: string, localPath: string) => Promise<boolean>

export async function buildWithGitHubActions(params: {
  localPath: string
  repoFullName: string        // "owner/repo"
  githubToken: string
  buildEnvVars: Record<string, string>  // e.g. { VITE_SUPABASE_URL: '...' }
  onProgress: (msg: string) => Promise<void>
  onBuildError?: OnBuildError  // optional AI fix callback; if omitted errors throw immediately
  maxAttempts?: number         // default 1
}): Promise<string> {
  const { localPath, repoFullName, githubToken, buildEnvVars, onProgress, onBuildError, maxAttempts = 1 } = params
  const [owner, repo] = repoFullName.split('/')
  if (!owner || !repo) throw new Error(`Invalid repoFullName: ${repoFullName}`)

  // 1. Set VITE_* env vars as GitHub repo variables (only needed once)
  const varNames = Object.keys(buildEnvVars)
  if (varNames.length > 0) {
    await onProgress(`⚙️  Setting ${varNames.length} GitHub repo variable(s) for build…`)
    for (const [name, value] of Object.entries(buildEnvVars)) {
      await setRepoVariable(owner, repo, name, value, githubToken)
    }
  }

  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'ForgeAI', GIT_AUTHOR_EMAIL: 'bot@forgeai.app',
    GIT_COMMITTER_NAME: 'ForgeAI', GIT_COMMITTER_EMAIL: 'bot@forgeai.app',
    GIT_TERMINAL_PROMPT: '0',
  }
  // Inject token into remote URL once (persistent for the repo lifetime on this disk)
  const authedRemote = `https://x-access-token:${githubToken}@github.com/${owner}/${repo}.git`
  await execAsync(`git remote set-url origin ${authedRemote}`, { cwd: localPath, timeout: 10_000 })

  // ── Retry loop: push → wait → (fix if needed) ────────────────────────────────
  const workflowDir = path.join(localPath, '.github', 'workflows')
  const workflowPath = path.join(workflowDir, 'forgeai-deploy.yml')
  fs.mkdirSync(workflowDir, { recursive: true })

  let lastRunId: number | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // 2. Commit ALL changes (patches + workflow) with a unique token so each attempt triggers a new run
    const triggerToken = Date.now().toString(36)
    fs.writeFileSync(workflowPath, workflowYaml(varNames, triggerToken), 'utf-8')

    await execAsync('git add -u', { cwd: localPath, timeout: 30_000 })
    await execAsync('git add .github/workflows/forgeai-deploy.yml', { cwd: localPath, timeout: 30_000 })
    await execAsync(`git commit --allow-empty -m "ci: ForgeAI deploy attempt ${attempt} (${triggerToken})"`, {
      cwd: localPath, timeout: 30_000, env: gitEnv,
    })
    await execAsync('git push origin HEAD', { cwd: localPath, timeout: 60_000, env: gitEnv })
    await onProgress(`📤 Pushed to GitHub (attempt ${attempt}) — waiting for Actions build…`)

    // 3. Wait for this push's run to appear and complete
    const startedAt = Date.now()
    const TIMEOUT = 10 * 60 * 1000
    let runId: number | null = null
    let workflowRunUrl = ''

    while (Date.now() - startedAt < TIMEOUT) {
      await new Promise(r => setTimeout(r, 12_000))
      const { data } = await axios.get(
        `${GH_API}/repos/${owner}/${repo}/actions/runs?event=push&per_page=10`,
        { headers: ghHeaders(githubToken) },
      )
      const run = (data.workflow_runs ?? []).find(
        (r: any) => r.path === '.github/workflows/forgeai-deploy.yml'
          && r.status !== 'cancelled'
          && r.id !== lastRunId,  // skip the previous run
      ) ?? null
      if (run) {
        runId = run.id
        workflowRunUrl = run.html_url
        if (run.status === 'completed') break
        await onProgress(`⏳ Actions build ${run.status} — ${workflowRunUrl}`)
        break
      }
    }

    if (!runId) throw new Error('GitHub Actions workflow run not found after push (check repo Actions tab)')
    lastRunId = runId

    // Poll until completed
    while (true) {
      if (Date.now() - startedAt > TIMEOUT) throw new Error('GitHub Actions build timed out (10 min)')
      await new Promise(r => setTimeout(r, 15_000))
      const { data } = await axios.get(
        `${GH_API}/repos/${owner}/${repo}/actions/runs/${runId}`,
        { headers: ghHeaders(githubToken) },
      )
      if (data.status === 'completed') {
        if (data.conclusion === 'success') break

        // Build failed — get the log and optionally fix
        const jobLog = await getFailedJobLog(owner, repo, runId, githubToken)
        if (onBuildError && attempt < maxAttempts) {
          await onProgress(`⚠️ Actions build failed (attempt ${attempt}) — asking AI to fix…`)
          const fixed = await onBuildError(jobLog, localPath)
          if (fixed) break  // break inner loop to retry outer loop
        }
        throw new Error(`GitHub Actions build failed (${data.conclusion}) — ${workflowRunUrl}\n\n${jobLog.slice(0, 800)}`)
      }
      await onProgress(`⏳ Actions build ${data.status}…`)
    }

    // If we got here with a completed success, the artifact is ready
    const { data: runCheck } = await axios.get(
      `${GH_API}/repos/${owner}/${repo}/actions/runs/${runId}`,
      { headers: ghHeaders(githubToken) },
    )
    if (runCheck.conclusion === 'success') {
      await onProgress('✅ GitHub Actions build complete — downloading artifact…')

      // 4. Download the dist artifact
      const { data: artData } = await axios.get(
        `${GH_API}/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`,
        { headers: ghHeaders(githubToken) },
      )
      const artifact = artData.artifacts?.find((a: any) => a.name === 'dist')
      if (!artifact) throw new Error('No dist artifact found in workflow run')

      // 5. Download + extract to tmpDir/dist/
      const zipResp = await axios.get(artifact.archive_download_url, {
        headers: ghHeaders(githubToken),
        responseType: 'arraybuffer',
        maxRedirects: 5,
      })
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-dist-'))
      const distDir = path.join(tmpDir, 'dist')
      fs.mkdirSync(distDir, { recursive: true })
      const zip = new AdmZip(Buffer.from(zipResp.data))
      zip.extractAllTo(distDir, true)

      await onProgress(`📦 Artifact extracted — uploading to R2…`)
      return tmpDir  // caller: pass this as localPath to selfHostedDeploy; rm -rf after upload
    }
    // If not success (shouldn't reach here normally), continue outer loop
  }

  throw new Error('GitHub Actions build failed after all attempts')
}

/** Download the last ~4 KB of the failed build step's log from GitHub API. */
async function getFailedJobLog(owner: string, repo: string, runId: number, token: string): Promise<string> {
  try {
    const { data: jobsData } = await axios.get(
      `${GH_API}/repos/${owner}/${repo}/actions/runs/${runId}/jobs`,
      { headers: ghHeaders(token) },
    )
    const failedJob = jobsData.jobs?.find((j: any) => j.conclusion === 'failure')
    if (!failedJob) return ''

    // GitHub API returns a redirect to the log URL
    const logResp = await axios.get(
      `${GH_API}/repos/${owner}/${repo}/actions/jobs/${failedJob.id}/logs`,
      { headers: ghHeaders(token), maxRedirects: 5, responseType: 'text' },
    )
    const log: string = typeof logResp.data === 'string' ? logResp.data : JSON.stringify(logResp.data)
    // Return the last 4 KB (most relevant part)
    return log.slice(-4096)
  } catch {
    return ''
  }
}
