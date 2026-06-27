import { Job } from 'bullmq'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import simpleGit from 'simple-git'
import { Task, IFileChange } from './task.model'
import { Repository } from '../repository/repository.model'
import { createProvider } from '../ai/ai.factory'
import { emitTaskUpdate } from '../websocket'
import { User } from '../users/user.model'

const PYTHON_SERVICE = process.env.PYTHON_SERVICE_URL ?? 'http://localhost:5001'
const REPOS_DIR = process.env.REPOS_DIR ?? path.join(process.cwd(), 'repos')
const MAX_ITERATIONS = 5

export async function processTask(job: Job) {
  const { type } = job.data

  switch (type) {
    case 'clone_repo':
      return cloneRepository(job)
    case 'fix_workspace':
      return fixWorkspace(job)
    case 'fix_file':
      return fixFile(job)
    default:
      throw new Error(`Unknown task type: ${type}`)
  }
}

// ─── Clone Repository ──────────────────────────────────────
async function cloneRepository(job: Job) {
  const { repositoryId, cloneUrl, userId } = job.data
  const repo = await Repository.findById(repositoryId)
  if (!repo) throw new Error('Repository not found')

  const repoPath = path.join(REPOS_DIR, userId, repo.name)
  fs.mkdirSync(repoPath, { recursive: true })

  const fullUser = await User.findById(userId).select('+githubAccessToken')
  const authUrl = cloneUrl.replace('https://', `https://${fullUser?.githubAccessToken}@`)

  const git = simpleGit()
  await git.clone(authUrl, repoPath, ['--depth', '1'])

  repo.localPath = repoPath
  repo.status = 'indexing'
  await repo.save()

  // Trigger indexing
  await axios.post(`${PYTHON_SERVICE}/repo/index`, { path: repoPath, repositoryId })

  repo.status = 'ready'
  repo.indexed = true
  await repo.save()
}

// ─── Fix Workspace ─────────────────────────────────────────
async function fixWorkspace(job: Job) {
  const { taskId, repositoryId, localPath, aiProvider } = job.data
  const task = await Task.findById(taskId)
  if (!task) throw new Error('Task not found')

  await updateTask(task, { status: 'running', progress: 5 }, 'Starting Fix Workspace…')

  const provider = createProvider(aiProvider)
  const allChanges: IFileChange[] = []
  let iteration = 0

  while (iteration < MAX_ITERATIONS) {
    iteration++
    await updateTask(task, { progress: 5 + iteration * 15 }, `Iteration ${iteration}: running build & lint…`)

    // 1. Run build/lint via Python service
    let errors: string[] = []
    try {
      const { data } = await axios.post(`${PYTHON_SERVICE}/analyze`, { path: localPath })
      errors = data.errors ?? []
    } catch {
      await updateTask(task, {}, 'Python service unavailable, skipping static analysis', 'warn')
    }

    if (errors.length === 0) {
      await updateTask(task, { progress: 90 }, 'No errors found — workspace is clean!')
      break
    }

    await updateTask(task, {}, `Found ${errors.length} error(s). Asking AI to fix…`)

    // 2. Build context
    let context = ''
    try {
      const { data } = await axios.post(`${PYTHON_SERVICE}/repo/context`, {
        path: localPath,
        query: errors.join('\n'),
      })
      context = data.context ?? ''
    } catch { /* continue */ }

    // 3. Ask AI
    const prompt = buildFixPrompt(errors, context)
    const response = await provider.chat([{ role: 'user', content: prompt }], FIX_SYSTEM_PROMPT)

    // 4. Parse and apply changes
    const parsed = parseAIChanges(response.content)
    if (!parsed.length) {
      await updateTask(task, {}, 'AI could not determine fixes, stopping.', 'warn')
      break
    }

    for (const change of parsed) {
      const absPath = path.join(localPath, change.path)
      if (!absPath.startsWith(localPath)) continue // security

      const before = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf-8') : ''
      fs.mkdirSync(path.dirname(absPath), { recursive: true })
      fs.writeFileSync(absPath, change.content, 'utf-8')

      const { additions, deletions } = diffStats(before, change.content)
      allChanges.push({ path: change.path, before, after: change.content, additions, deletions })
      await updateTask(task, {}, `Updated: ${change.path} (+${additions}/-${deletions})`)
    }
  }

  // 5. Commit changes to a new branch
  if (allChanges.length) {
    try {
      const branchName = `forgeai/fix-${taskId.slice(-6)}`
      const git = simpleGit(localPath)
      await git.checkoutLocalBranch(branchName)
      await git.add('.')
      await git.commit(`ForgeAI: Auto-fix ${allChanges.length} file(s)`)
      await updateTask(task, {}, `Committed changes to branch: ${branchName}`)
    } catch (err: any) {
      await updateTask(task, {}, `Git commit skipped: ${err.message}`, 'warn')
    }
  }

  const summary = allChanges.length
    ? `Fixed ${allChanges.length} file(s) across ${iteration} iteration(s). ${allChanges.map((c) => c.path).join(', ')}`
    : 'No changes were needed.'

  task.changes = allChanges
  task.status = 'completed'
  task.progress = 100
  task.summary = summary
  await task.save()
  emitTaskUpdate(taskId, task.toObject())
}

// ─── Fix Single File ───────────────────────────────────────
async function fixFile(job: Job) {
  const { taskId, localPath, filePath, aiProvider } = job.data
  const task = await Task.findById(taskId)
  if (!task) throw new Error('Task not found')

  await updateTask(task, { status: 'running', progress: 10 }, `Fixing file: ${filePath}`)

  const absPath = path.join(localPath, filePath)
  if (!fs.existsSync(absPath)) throw new Error('File not found')

  const before = fs.readFileSync(absPath, 'utf-8')
  const provider = createProvider(aiProvider)

  const prompt = `Fix all bugs, lint errors, and code quality issues in this file.
Return ONLY the complete fixed file content, no explanations.

File: ${filePath}
\`\`\`
${before}
\`\`\``

  const response = await provider.chat([{ role: 'user', content: prompt }], FIX_SYSTEM_PROMPT)
  const after = extractCodeBlock(response.content) ?? response.content

  fs.writeFileSync(absPath, after, 'utf-8')
  const { additions, deletions } = diffStats(before, after)

  task.changes = [{ path: filePath, before, after, additions, deletions }]
  task.status = 'completed'
  task.progress = 100
  task.summary = `Fixed ${filePath} (+${additions}/-${deletions})`
  await task.save()
  emitTaskUpdate(taskId, task.toObject())
}

// ─── Helpers ───────────────────────────────────────────────
async function updateTask(
  task: any,
  updates: Record<string, any>,
  message?: string,
  level: 'info' | 'warn' | 'error' = 'info',
) {
  Object.assign(task, updates)
  if (message) {
    task.logs.push({ level, message, timestamp: new Date() })
  }
  await task.save()
  emitTaskUpdate(task._id.toString(), task.toObject())
}

function buildFixPrompt(errors: string[], context: string): string {
  return `Fix the following errors in the codebase.

ERRORS:
${errors.slice(0, 20).join('\n')}

${context ? `REPOSITORY CONTEXT:\n${context}` : ''}

Return your fixes in this exact format for each file you change:

<file path="relative/path/to/file.ts">
// complete file content here
</file>

Only include files you actually changed.`
}

const FIX_SYSTEM_PROMPT = `You are ForgeAI, an autonomous software engineer.
Your job is to fix code errors by modifying files.
Always return complete file content — never partial diffs.
Be precise. Do not add unnecessary comments or changes.`

interface ParsedChange { path: string; content: string }

function parseAIChanges(response: string): ParsedChange[] {
  const changes: ParsedChange[] = []
  const regex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g
  let match
  while ((match = regex.exec(response)) !== null) {
    changes.push({ path: match[1].trim(), content: match[2].trim() })
  }
  return changes
}

function extractCodeBlock(text: string): string | null {
  const match = text.match(/```(?:\w+)?\n([\s\S]+?)\n```/)
  return match ? match[1] : null
}

function diffStats(before: string, after: string): { additions: number; deletions: number } {
  const a = before.split('\n')
  const b = after.split('\n')
  return {
    additions: b.filter((l) => !a.includes(l)).length,
    deletions: a.filter((l) => !b.includes(l)).length,
  }
}
