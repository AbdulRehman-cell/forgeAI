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

export async function buildWithGitHubActions(params: {
  localPath: string
  repoFullName: string        // "owner/repo"
  githubToken: string
  buildEnvVars: Record<string, string>  // e.g. { VITE_SUPABASE_URL: '...' }
  onProgress: (msg: string) => Promise<void>
}): Promise<string> {
  const { localPath, repoFullName, githubToken, buildEnvVars, onProgress } = params
  const [owner, repo] = repoFullName.split('/')
  if (!owner || !repo) throw new Error(`Invalid repoFullName: ${repoFullName}`)

  // 1. Set VITE_* env vars as GitHub repo variables
  const varNames = Object.keys(buildEnvVars)
  if (varNames.length > 0) {
    await onProgress(`⚙️  Setting ${varNames.length} GitHub repo variable(s) for build…`)
    for (const [name, value] of Object.entries(buildEnvVars)) {
      await setRepoVariable(owner, repo, name, value, githubToken)
    }
  }

  // 2. Commit ALL source patches (HashRouter etc.) + the workflow file, then push
  const triggerToken = Date.now().toString(36)  // unique token forces a new commit each time
  const workflowDir = path.join(localPath, '.github', 'workflows')
  const workflowPath = path.join(workflowDir, 'forgeai-deploy.yml')
  fs.mkdirSync(workflowDir, { recursive: true })
  fs.writeFileSync(workflowPath, workflowYaml(varNames, triggerToken), 'utf-8')

  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'ForgeAI', GIT_AUTHOR_EMAIL: 'bot@forgeai.app',
    GIT_COMMITTER_NAME: 'ForgeAI', GIT_COMMITTER_EMAIL: 'bot@forgeai.app',
  }
  // Stage modified tracked files (picks up HashRouter patches) + the new workflow
  await execAsync('git add -u', { cwd: localPath, timeout: 30_000 })
  await execAsync('git add .github/workflows/forgeai-deploy.yml', { cwd: localPath, timeout: 30_000 })
  await execAsync(`git commit --allow-empty -m "ci: deploy via ForgeAI Actions (${triggerToken})"`, {
    cwd: localPath, timeout: 30_000, env: gitEnv,
  })
  await execAsync('git push', { cwd: localPath, timeout: 60_000 })
  await onProgress('📤 Pushed deploy workflow to GitHub — waiting for Actions build…')

  // 3. Poll for the workflow run (triggered by our push) to complete (up to 10 min)
  const startedAt = Date.now()
  const TIMEOUT = 10 * 60 * 1000
  let runId: number | null = null
  let workflowRunUrl = ''

  // Wait for a run for the workflow we just pushed to appear
  while (Date.now() - startedAt < TIMEOUT) {
    await new Promise(r => setTimeout(r, 12_000))
    const { data } = await axios.get(
      `${GH_API}/repos/${owner}/${repo}/actions/runs?event=push&per_page=10`,
      { headers: ghHeaders(githubToken) },
    )
    // Find the most recent run whose workflow is forgeai-deploy.yml
    const run = (data.workflow_runs ?? []).find(
      (r: any) => r.path === '.github/workflows/forgeai-deploy.yml' && r.status !== 'cancelled',
    ) ?? (data.workflow_runs ?? [])[0]

    if (run) {
      runId = run.id
      workflowRunUrl = run.html_url
      if (run.status === 'completed') {
        if (run.conclusion !== 'success') throw new Error(`GitHub Actions build failed (${run.conclusion}) — ${workflowRunUrl}`)
        break
      }
      await onProgress(`⏳ Actions build ${run.status} — ${workflowRunUrl}`)
      break
    }
  }

  if (!runId) throw new Error('GitHub Actions workflow run not found after push (check repo Actions tab)')

  // Poll until the run completes
  while (true) {
    if (Date.now() - startedAt > TIMEOUT) throw new Error('GitHub Actions build timed out (10 min)')
    await new Promise(r => setTimeout(r, 15_000))
    const { data } = await axios.get(
      `${GH_API}/repos/${owner}/${repo}/actions/runs/${runId}`,
      { headers: ghHeaders(githubToken) },
    )
    if (data.status === 'completed') {
      if (data.conclusion !== 'success') throw new Error(`GitHub Actions build failed (${data.conclusion}) — ${workflowRunUrl}`)
      break
    }
    await onProgress(`⏳ Actions build ${data.status}…`)
  }

  await onProgress('✅ GitHub Actions build complete — downloading artifact…')

  // 4. Download the dist artifact
  const { data: artData } = await axios.get(
    `${GH_API}/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`,
    { headers: ghHeaders(githubToken) },
  )
  const artifact = artData.artifacts?.find((a: any) => a.name === 'dist')
  if (!artifact) throw new Error('No dist artifact found in workflow run')

  const zipResp = await axios.get(artifact.archive_download_url, {
    headers: ghHeaders(githubToken),
    responseType: 'arraybuffer',
    maxRedirects: 5,
  })

  // 5. Extract to tmpDir/dist/ so findDeployRoot(tmpDir) finds tmpDir/dist/index.html
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-dist-'))
  const distDir = path.join(tmpDir, 'dist')
  fs.mkdirSync(distDir, { recursive: true })
  const zip = new AdmZip(Buffer.from(zipResp.data))
  zip.extractAllTo(distDir, true)

  await onProgress(`📦 Artifact extracted — uploading to R2…`)
  return tmpDir  // caller: pass this as localPath to selfHostedDeploy; rm -rf after upload
}
