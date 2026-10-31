// Forge Agent — an autonomous, Claude Code-style loop.
// The AI is given tools (list_dir / read_file / search / edit_file / write_file / run_command)
// and iterates against a local workspace folder until the instruction is done,
// streaming every step to the UI through the existing task log websocket.

import os from 'os'
import simpleGit from 'simple-git'
import axios from 'axios'
import { Task, IFileChange } from '../tasks/task.model'
import { Repository } from '../repository/repository.model'
import { User } from '../users/user.model'
import { createProvider } from '../ai/ai.factory'
import { emitTaskUpdate } from '../websocket'
import { getEnvToken, redeployRender } from '../../lib/deployers'
import type { Job } from '../../lib/workers'
import type { AIMessage } from '../ai/providers/base'
import * as tools from './agent.tools'

const MAX_STEPS = Number(process.env.AGENT_MAX_STEPS ?? 30)
const PYTHON_SERVICE = process.env.PYTHON_SERVICE_URL ?? 'http://localhost:5001'

// Total character budget for the conversation sent to the AI provider.
// GitHub Models (the default provider) enforces a small per-request input
// limit and returns HTTP 413 when exceeded. ~4 chars ≈ 1 token.
// With a Gemini key configured, the hybrid provider routes conversations
// beyond GitHub's limit to Gemini's huge context window — so long projects
// can keep far more history instead of forgetting what was already done.
const HAS_GEMINI_HELPER = !!process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes('...')
const HISTORY_BUDGET = Number(process.env.AGENT_HISTORY_BUDGET ?? (HAS_GEMINI_HELPER ? 100_000 : 24_000))
const MAX_MESSAGE_CHARS = HAS_GEMINI_HELPER ? 30_000 : 12_000

// Pause between agent steps — free AI tiers allow only a few requests/minute
// and reply with HTTP 429 when hammered
const STEP_DELAY_MS = Number(process.env.AGENT_STEP_DELAY_MS ?? 4_000)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// In-memory cancellation registry (jobs run in-process)
const cancelledTasks = new Set<string>()
export function cancelAgentTask(taskId: string) {
  cancelledTasks.add(taskId)
}

const SYSTEM_PROMPT = `You are Forge Agent, an autonomous software engineer with direct access to the user's project folder and terminal, running on the user's own machine (${os.platform() === 'win32' ? 'Windows — commands run in PowerShell' : 'Unix — commands run in bash'}).

You work in steps. Each reply must contain ONE OR MORE tool calls. Available tools:

1. List a directory:
\`\`\`json
{"tool": "list_dir", "path": ".", "depth": 2}
\`\`\`

2. Read a file (large files are returned in pages — pass "start_line" to read further; NEVER rewrite a file you have only partially seen):
\`\`\`json
{"tool": "read_file", "path": "src/app.ts", "start_line": 1}
\`\`\`

3. Search all files for text:
\`\`\`json
{"tool": "search", "query": "createServer"}
\`\`\`

4. Run a terminal command in the workspace root (builds, tests, installs, linters — 3 min timeout):
\`\`\`json
{"tool": "run_command", "command": "npm test"}
\`\`\`

5. **PREFERRED FOR SMALL EDITS TO LARGE FILES** — surgical string replacement. Finds ONE exact occurrence of old_string in the file and replaces it with new_string. Nothing else is touched. Use this whenever you want to change a specific block (one CSS rule, one function, one line) inside a file bigger than what you can hold in context.
CRITICAL: edit_file MUST use the XML format below — never use JSON for this tool:
<edit_file path="relative/path/to/file.ts">
<old>
.contact-form { padding: 2rem; }
</old>
<new>
.contact-form { padding: 2rem; display: grid; gap: 1rem; }
</new>
</edit_file>
Requirements: old_string must appear EXACTLY ONCE in the file (whitespace/casing exact) — if it isn't unique, add more surrounding context (a nearby selector/comment) until it is. This tool has no size limit and no shrink guard because it CANNOT accidentally delete unrelated content.

6. Write/create a file (creates a NEW file, or fully replaces an existing one — ALWAYS the complete file content, never a partial diff). Use only when you're creating a file from scratch, or when a WHOLE-file rewrite is truly needed. For any change to a subset of an existing file, use edit_file (#5) instead:
<write_file path="relative/path/to/file.ts">
...entire file content...
</write_file>
Two safety cliffs on writes that shrink an existing file:
  • Soft (retains <66% of original): BLOCKED. If a smaller replacement is genuinely wanted, resend with confirm="true".
  • Hard (retains <40% of original): BLOCKED even with confirm="true" — losing more than 60% of a file in one write is almost always the model gutting content it never saw. In that case switch to edit_file for surgical changes, or read the whole file page-by-page (start_line) before rewriting.
When you have only seen a PARTIAL page of a large file, DO NOT rewrite it with write_file — either page through with start_line until you have read every line, or use edit_file to change just the block you care about. "Fix section X" means change the rules for section X while keeping every rule for sections Y, Z, W etc. exactly as they were.

7. Finish — ONLY when the instruction has been applied across every relevant file and the known issues are fixed (or the task is impossible):
\`\`\`json
{"tool": "done", "summary": "Markdown summary of what you did, what you verified, and anything the user should know."}
\`\`\`

IMPORTANT — LIMITED CONTEXT: your conversation window is SMALL and older tool results get trimmed away. Do NOT survey many files before acting — you will lose what you read. Work file-by-file: read ONE file (or just the page containing the block you'll edit), IMMEDIATELY apply your fix with <edit_file> (surgical) or <write_file> (full rewrite), then move to the next file. Batch independent tool calls into one reply. Never request the same content twice.

TOOL CHOICE — this decides whether your fix succeeds or destroys the user's work:
- Small/localized change (fixing one CSS rule, tweaking one function, renaming a class, adding a media query) → **edit_file**. Read enough to identify a unique block, then replace it. Do NOT rewrite the whole file.
- New file, or the entire file's structure is genuinely being replaced → **write_file**.
- If write_file is blocked by the shrink guard, that is the system telling you your write is destructive — switch to edit_file instead of re-sending with confirm="true".

QUALITY BAR — the result must look professionally designed and delight the user, never "AI-generated filler":
- DEFAULT to surgical edits: fix or add the specific thing the user asked for and PRESERVE every other rule/section already in the file. Small requests ("fix X", "add Y", "make Z work") do NOT mean "rewrite the whole stylesheet" — losing the user's existing design is worse than any polish you could add. Never use confirm="true" as a shortcut around the shrink guard: the guard exists because full rewrites almost always destroy work.
- ONLY do a full redesign when the user EXPLICITLY asks for one ("redesign from scratch", "start over", "throw it all out", "give me a completely new look"). In that case, and only then, send the full replacement file with confirm="true" — and make sure the new file is at LEAST as complete as the old one (every page's classes/ids still styled, every media query preserved). If you're unsure whether the user wants surgical or wholesale, DEFAULT TO SURGICAL.
- When designing (whether surgical or wholesale): cohesive color palette as CSS variables, modern layout (flexbox/grid), generous whitespace, border-radius, layered shadows, smooth transitions, hover/focus states, keyframe animations where tasteful, and responsive breakpoints.
- Typography: link a Google Font (e.g. Inter, Poppins, Playfair Display) in the HTML <head> and define a clear type scale.
- CONTRAST IS NON-NEGOTIABLE: run a mental check on every text/background pair — never light text on light backgrounds or dark on dark.
- Images: use https://picsum.photos/800/500 style URLs (add ?random=2 to vary) or inline SVG — NEVER reference image files that don't exist in the project.
- New pages: create complete standalone HTML files sharing the same header/footer/nav, and add working links to them from EVERY page's nav.
- Never break functionality: preserve every id, class, and DOM hook the JavaScript references — redesign around them.

Rules:
- Investigate before editing: read the relevant files first, never guess their contents.
- FIX THE WHOLE PROJECT, not just the literal instruction: apply the instruction across EVERY file it touches (styles, markup, scripts — all pages/components, not just one), and when you spot other clear problems along the way (syntax errors, broken references, bugs), fix those too. Only skip this when the instruction explicitly limits you to specific files.
- Match commands to the stack: check for package.json before ANY npm/node command — plain HTML/CSS/JS sites have nothing to install, build, or test, so don't waste steps trying.
- PRESERVE the user's work: never delete a file, strip out sections, or regenerate a file from scratch unless the instruction explicitly requires it. Fixing UI/styles means adjusting the existing structure, not replacing it.
- After making changes, verify them when possible (run the build, tests, or a quick command) and fix what breaks.
- Prefer minimal, surgical changes. Keep the project's existing style.
- Never run destructive commands (rm -rf outside the workspace, force pushes, disk formatting). Do not touch files outside the workspace.
- If a command needs input, find a non-interactive flag instead.
- NEVER run long-running commands (npm start, dev servers, watch modes) — they hang until the timeout and tell you nothing. To verify a server boots, use a one-shot check like "node -e \\"require('./app')\\"" or run the test/build script instead.
- Always end the session with the "done" tool and a clear summary.`

interface Action {
  tool: string
  path?: string
  depth?: number
  start_line?: number
  query?: string
  command?: string
  summary?: string
  content?: string
  old_string?: string
  new_string?: string
  confirm?: boolean
  index: number
}

export function parseActions(text: string): Action[] {
  const actions: Action[] = []

  // <write_file path="..." [confirm="true"]>content</write_file>
  const writeRe = /<write_file\s+path="([^"]+)"([^>]*)>\r?\n?([\s\S]*?)<\/write_file>/g
  const writeRanges: [number, number][] = []
  let m: RegExpExecArray | null
  while ((m = writeRe.exec(text)) !== null) {
    actions.push({
      tool: 'write_file',
      path: m[1].trim(),
      confirm: /confirm="true"/.test(m[2]),
      content: m[3],
      index: m.index,
    })
    writeRanges.push([m.index, m.index + m[0].length])
  }

  // <edit_file path="..."><old>...</old><new>...</new></edit_file>
  // Surgical replacement — the tool for editing a large file when only a
  // small piece needs to change. Parsed after write_file so the two ranges
  // don't overlap. `[\s\S]*?` is non-greedy so the outer close tag isn't
  // swallowed by an inner CSS-block brace.
  const editRe = /<edit_file\s+path="([^"]+)"[^>]*>\s*<old>\r?\n?([\s\S]*?)\r?\n?<\/old>\s*<new>\r?\n?([\s\S]*?)\r?\n?<\/new>\s*<\/edit_file>/g
  const editRanges: [number, number][] = []
  while ((m = editRe.exec(text)) !== null) {
    actions.push({
      tool: 'edit_file',
      path: m[1].trim(),
      old_string: m[2],
      new_string: m[3],
      index: m.index,
    })
    editRanges.push([m.index, m.index + m[0].length])
  }

  // Regions already consumed — never re-parse content inside them
  const consumed: [number, number][] = [...writeRanges, ...editRanges]
  const isConsumed = (i: number) => consumed.some(([start, end]) => i >= start && i < end)

  // ```json { ... } ``` fences — also plain ``` fences, models often drop the
  // language tag (skip any that sit inside a write_file body)
  const jsonRe = /```(?:json)?\s*([\s\S]*?)```/g
  while ((m = jsonRe.exec(text)) !== null) {
    if (isConsumed(m.index)) continue
    try {
      const obj = JSON.parse(m[1].trim())
      if (obj && typeof obj.tool === 'string') {
        actions.push({ ...obj, index: m.index })
        consumed.push([m.index, m.index + m[0].length])
      }
    } catch { /* fence may hold several bare JSON lines — the scan below gets them */ }
  }

  // Bare JSON objects on their own lines — models frequently skip the fences
  let pos = 0
  for (const line of text.split('\n')) {
    const start = pos
    pos += line.length + 1
    const trimmed = line.trim()
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}') || isConsumed(start)) continue
    try {
      const obj = JSON.parse(trimmed)
      if (obj && typeof obj.tool === 'string') actions.push({ ...obj, index: start })
    } catch { /* not JSON, ignore */ }
  }

  // Whole reply is a single JSON object (possibly spanning multiple lines)
  if (!actions.length) {
    try {
      const obj = JSON.parse(text.trim())
      if (obj && typeof obj.tool === 'string') actions.push({ ...obj, index: 0 })
    } catch { /* fall through */ }
  }

  return actions.sort((a, b) => a.index - b.index)
}

// ─── History size management ───────────────────────────────
// Keeps requests under the provider's input limit (HTTP 413 otherwise).

/** Replace write_file bodies with stubs — the content is already on disk.
 *  Deliberately NOT in <write_file> syntax: when the stub looks like a valid
 *  tool call, the model imitates it and "writes" the placeholder text as
 *  real file content, gutting the file. */
function compactAssistantReply(text: string): string {
  return text.replace(
    /<write_file\s+path="([^"]+)"[^>]*>[\s\S]*?<\/write_file>/g,
    (_, p) => `[wrote ${p} — content saved to disk, not repeated in history]`,
  )
}

function truncateMiddle(s: string, max: number): string {
  if (s.length <= max) return s
  const head = Math.floor(max * 0.6)
  const tail = Math.floor(max * 0.3)
  return `${s.slice(0, head)}\n… (${s.length - head - tail} chars trimmed) …\n${s.slice(-tail)}`
}

const totalChars = (msgs: AIMessage[]) => msgs.reduce((n, m) => n + m.content.length, 0)

/**
 * Shrink the conversation to fit the budget: cap individual messages,
 * then drop the oldest tool exchanges (keeping the initial context and
 * the most recent exchange).
 */
function trimHistory(messages: AIMessage[], budget: number) {
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].content.length > MAX_MESSAGE_CHARS) {
      messages[i] = { ...messages[i], content: truncateMiddle(messages[i].content, MAX_MESSAGE_CHARS) }
    }
  }
  while (totalChars(messages) > budget && messages.length > 3) {
    messages.splice(1, 2) // oldest assistant reply + its tool results
  }
  // Still over (e.g. huge recent messages) — squeeze everything but the last exchange
  let perMessage = MAX_MESSAGE_CHARS
  while (totalChars(messages) > budget && perMessage > 1_500) {
    perMessage = Math.floor(perMessage / 2)
    for (let i = 1; i < messages.length - 1; i++) {
      if (messages[i].content.length > perMessage) {
        messages[i] = { ...messages[i], content: truncateMiddle(messages[i].content, perMessage) }
      }
    }
  }
}

export async function runAgentTask(job: Job) {
  const { taskId, localPath, instruction, aiProvider, imageDataUrls } = job.data
  const task = await Task.findById(taskId)
  if (!task) throw new Error('Task not found')

  const log = async (message: string, level: 'info' | 'warn' | 'error' = 'info', updates: Record<string, any> = {}) => {
    Object.assign(task, updates)
    task.logs.push({ level, message, timestamp: new Date() } as any)
    await task.save()
    emitTaskUpdate(taskId, task.toObject())
  }

  // The live agent always runs on the free GitHub+Gemini stack; AGENT_AI_MODEL
  // lets it run a stronger GitHub model for agent sessions than for quick chat.
  // Claude is reserved for the builder's QA pass, not live agent turns.
  const providerName = 'github' as const
  const provider = createProvider(providerName, process.env.AGENT_AI_MODEL)

  await log(`🤖 Agent started (${providerName}): "${instruction.slice(0, 120)}"`, 'info', { status: 'running', progress: 3 })

  const changesByPath = new Map<string, IFileChange>()
  // How many times each exact tool call has been made — used to break the
  // read → trim → re-read loop that wastes scarce free-tier requests
  const actionCounts = new Map<string, number>()

  // Project-wide static analysis (same engine Fix Workspace uses) so the
  // agent starts knowing about issues in ALL files, not just the ones the
  // instruction mentions. Best effort — the Python service is optional.
  let knownIssues = ''
  try {
    const { data } = await axios.post(`${PYTHON_SERVICE}/analyze`, { path: localPath }, { timeout: 30_000 })
    if (data.errors?.length) {
      knownIssues = `\n\nKNOWN ISSUES (whole-project static analysis — fix these too unless the instruction limits you to specific files):\n${data.errors.slice(0, 15).map((e: string) => `- ${e}`).join('\n')}`
      await log(`🔎 Static analysis found ${data.errors.length} issue(s) — the agent will address them alongside your instruction`)
    }
  } catch { /* Python service not running — proceed without the issue list */ }

  if (imageDataUrls?.length) {
    await log(`🖼️ ${imageDataUrls.length} image(s) attached (no text detected — sent to the vision model as-is)`)
  }

  const messages: AIMessage[] = [{
    role: 'user',
    // Text-free reference images (mockups/screenshots) stay attached to this
    // first message for the whole session — trimHistory never drops it
    images: imageDataUrls?.length ? imageDataUrls : undefined,
    content: `WORKSPACE ROOT: ${localPath}

PROJECT STRUCTURE (2 levels):
${safeTool(() => tools.listDir(localPath, '.', 2))}

USER INSTRUCTION:
${instruction}${knownIssues}

Apply the instruction across the WHOLE project (every relevant file), and fix any other clear problems you come across — unless the instruction explicitly says to only touch specific files.
Begin now. Reply with your first tool call(s) — a reply without a tool call does nothing.`,
  }]

  let finalSummary: string | null = null
  // Consecutive replies with no tool call — the model announcing its plan in
  // prose ("Let me read the file first…") must not end the session
  let noActionNudges = 0

  for (let step = 1; step <= MAX_STEPS; step++) {
    if (cancelledTasks.has(taskId)) {
      cancelledTasks.delete(taskId)
      await log('⏹ Stopped by user', 'warn')
      finalSummary = 'Session stopped by user.'
      break
    }

    task.progress = Math.min(90, 5 + step * 4)

    // Pace requests so free-tier rate limits aren't tripped in the first place
    if (step > 1) await sleep(STEP_DELAY_MS)

    let response: { content: string } | undefined
    let budget = HISTORY_BUDGET
    let attempt = 0
    trimHistory(messages, budget)
    while (!response) {
      try {
        response = await provider.chat(messages, SYSTEM_PROMPT)
      } catch (err: any) {
        attempt++
        const status: number | undefined =
          err.response?.status ?? (Number(/status code (\d{3})/.exec(err.message ?? '')?.[1]) || undefined)

        // Request too large → shrink the history hard and retry
        if (status === 413 && attempt <= 2) {
          budget = Math.floor(budget / 2)
          await log('Request too large for the AI provider — compacting history and retrying…', 'warn')
          trimHistory(messages, budget)
          continue
        }

        // Transient network failure (dropped socket, TLS handshake, DNS blip)
        // → no HTTP response at all; retry with a short backoff
        const isNetworkError = !err.response &&
          (err.code || /socket|network|TLS|timed? ?out|ECONN|EPIPE|EAI_AGAIN|ENOTFOUND/i.test(err.message ?? ''))
        if (isNetworkError && attempt <= 3) {
          const waitSec = 5 * 2 ** (attempt - 1)
          await log(`🌐 Network hiccup reaching the AI provider (${err.code ?? 'socket dropped'}) — retrying in ${waitSec}s (${attempt}/3)…`, 'warn')
          await sleep(waitSec * 1000)
          if (cancelledTasks.has(taskId)) break
          continue
        }

        // Rate limited → wait (Retry-After if given, else exponential backoff)
        if (status === 429 && attempt <= 4) {
          const retryAfter = Number(err.response?.headers?.['retry-after'])
          const waitSec = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(Math.ceil(retryAfter), 120)
            : Math.min(15 * 2 ** (attempt - 1), 120)
          await log(`⏳ AI provider rate limit — waiting ${waitSec}s, then retrying (${attempt}/4)…`, 'warn')
          await sleep(waitSec * 1000)
          if (cancelledTasks.has(taskId)) break // user stopped while waiting
          continue
        }

        const friendly = status === 429
          ? 'AI provider rate limit exhausted — the GitHub Models free tier has per-minute AND daily caps. Wait a while (daily caps reset at midnight UTC) and run the agent again; changes made so far are saved.'
          : `AI provider error: ${err.message}`
        await log(friendly, 'error')
        task.changes = [...changesByPath.values()]
        task.status = 'failed'
        task.error = friendly
        await task.save()
        emitTaskUpdate(taskId, task.toObject())
        return
      }
    }
    // Cancelled during a rate-limit wait — the top-of-loop check ends the session
    if (!response) continue

    const actions = parseActions(response.content)

    // No tool call: nudge the model back into the loop (it usually just
    // announced its plan in prose). Only after repeated chatter do we treat
    // the reply as the final answer.
    if (!actions.length) {
      if (noActionNudges < 2) {
        noActionNudges++
        await log('💬 Model replied without a tool call — asking it to act', 'warn')
        messages.push({ role: 'assistant', content: compactAssistantReply(response.content) })
        messages.push({
          role: 'user',
          content: 'Your reply contained NO tool call, so NOTHING happened. Do not describe what you will do — do it. Reply now with the tool call(s) for the action you described (```json fences, <edit_file>, or <write_file>). If the instruction is fully complete, reply with the "done" tool and a summary.',
        })
        continue
      }
      finalSummary = response.content.trim() || 'Agent finished without a summary.'
      break
    }
    noActionNudges = 0

    // Strip file bodies before storing — they'd be re-sent on every request
    messages.push({ role: 'assistant', content: compactAssistantReply(response.content) })
    const results: string[] = []
    let isDone = false

    for (const action of actions) {
      if (action.tool === 'done') {
        finalSummary = action.summary ?? 'Done.'
        isDone = true
        break
      }

      // Repeated read-only call? The content keeps getting trimmed from the
      // model's context — re-serving it just repeats the cycle. Nudge it to act.
      const sig = `${action.tool}|${action.path ?? ''}|${action.start_line ?? ''}|${action.query ?? ''}|${action.command ?? ''}`
      const seen = (actionCounts.get(sig) ?? 0) + 1
      actionCounts.set(sig, seen)
      if (seen >= 3 && ['read_file', 'list_dir', 'search'].includes(action.tool)) {
        await log(`↩️ Skipped repeated ${action.tool} (${seen}× same call) — telling the model to act instead`, 'warn')
        results.push(
          `### ${action.tool} "${action.path ?? action.query ?? ''}"\nSKIPPED — you have already requested exactly this ${seen} times. Your context is too small to hold everything, so surveying repeatedly gets you nowhere. ACT NOW: pick ONE file you understand, apply your fix in THIS reply (<edit_file> for a surgical change or <write_file> for a new/replaced file), then continue file-by-file. If the work is done, reply with the "done" tool.`,
        )
        continue
      }

      const result = await executeAction(action, localPath, changesByPath, log)
      results.push(result)
    }

    if (isDone) break

    messages.push({
      role: 'user',
      content: `TOOL RESULTS:\n\n${results.join('\n\n')}\n\nContinue. When the instruction is complete, reply with the "done" tool and a summary.`,
    })
  }

  if (!finalSummary) {
    await log(`Reached the ${MAX_STEPS}-step limit before finishing`, 'warn')
    finalSummary = `⚠️ Stopped after ${MAX_STEPS} steps without an explicit "done". Changes made so far are saved — review them and run the agent again to continue.`
  }

  task.changes = [...changesByPath.values()]

  // Push changes to GitHub (always, for cloned repos that have a GitHub remote)
  if (task.changes.length) {
    await pushAgentChangesToGitHub(job, task, instruction as string, log)
  }

  // Auto-deploy: this repo was previously deployed to Render → rebuild the
  // live site after the push so it picks up the new changes
  if (task.changes.length) {
    const deployNote = await autoRedeployRender(job, task, log)
    if (deployNote) finalSummary = `${deployNote}\n\n---\n\n${finalSummary}`
  }

  task.status = 'completed'
  task.progress = 100
  task.summary = finalSummary
  await task.save()
  emitTaskUpdate(taskId, task.toObject())
  // A change made from a home page conversation refreshes its preview
  if ((task.metadata as any)?.patchMode && task.changes.length && job.data.repositoryId) {
    const { queuePreview } = await import('../studio/preview.queue')
    await queuePreview(String(job.data.repositoryId), String(job.data.userId)).catch((e: any) => console.warn('[preview] could not start:', e?.message))
  }
}

/**
 * Commit and push the agent's changes to the GitHub remote.
 * Only runs for repos cloned by ForgeAI (source !== 'local') that have a
 * GitHub fullName — local folders manage their own git workflow.
 * Best-effort: a push failure is logged as a warning, not a hard error.
 */
async function pushAgentChangesToGitHub(
  job: Job,
  task: any,
  instruction: string,
  log: (msg: string, level?: 'info' | 'warn' | 'error') => Promise<void>,
): Promise<void> {
  const { repositoryId, userId, localPath } = job.data
  try {
    const repo = await Repository.findById(repositoryId)
    if (!repo || repo.source === 'local' || !repo.fullName) return

    const fullUser = await User.findById(userId).select('+githubAccessToken')
    if (!fullUser?.githubAccessToken) {
      await log('No GitHub token on file — changes saved locally but not pushed to GitHub', 'warn')
      return
    }

    const git = simpleGit(localPath)
    const changedPaths = task.changes.map((c: IFileChange) => c.path)

    await git.addConfig('user.email', 'agent@forgeai.app')
    await git.addConfig('user.name', 'ForgeAI Agent')
    await git.add(changedPaths)
    await git.commit(`ForgeAI Agent: ${instruction.slice(0, 72)}`)

    const pushUrl = `https://${fullUser.githubAccessToken}@github.com/${repo.fullName}.git`
    await git.push([pushUrl, 'HEAD:main'])
    await log(`✅ Pushed ${changedPaths.length} file(s) to GitHub (${repo.fullName})`)
  } catch (err: any) {
    const clean = (err.message as string).replace(/https?:\/\/[^@]+@/g, 'https://')
    await log(`⚠️ Could not push to GitHub: ${clean}`, 'warn')
  }
}

/**
 * If the repository has Render deploy state from a previous Blitz Deploy,
 * push the agent's changes and trigger a rebuild. Returns a markdown note
 * for the session summary, or null when auto-deploy doesn't apply.
 */
async function autoRedeployRender(
  job: Job,
  task: any,
  log: (msg: string, level?: 'info' | 'warn' | 'error') => Promise<void>,
): Promise<string | null> {
  const { repositoryId, userId, localPath, instruction } = job.data
  try {
    const repo = await Repository.findById(repositoryId)
    const renderState = repo?.deployState?.render
    if (!repo || !renderState?.serviceId) return null

    await log('🚀 This repo is deployed on Render — pushing changes and redeploying…')

    const fullUser = await User.findById(userId).select('+deployTokens.render +githubAccessToken plan')
    let token = fullUser?.deployTokens?.render || getEnvToken('render')
    if (!token) {
      await log('No Render token on file — skipping auto-deploy. Run Blitz Deploy once to reconnect Render.', 'warn')
      return null
    }

    // Cloned repos: push with a fresh token URL (the origin remote embeds the
    // token from clone time, which may have rotated). Local folders push to
    // their own origin with the user's git credentials.
    const pushRemote = repo.source !== 'local' && fullUser?.githubAccessToken
      ? `https://${fullUser.githubAccessToken}@github.com/${repo.fullName}.git`
      : 'origin'

    const result = await redeployRender(
      {
        localPath,
        token,
        serviceId: renderState.serviceId,
        pushRemote,
        // Local folders: stage ONLY what the agent touched — never sweep up
        // the user's uncommitted work. Cloned repos are ForgeAI-managed.
        changedPaths: repo.source === 'local' ? task.changes.map((c: IFileChange) => c.path) : undefined,
        commitMessage: `ForgeAI Agent: ${String(instruction).slice(0, 72)}`,
      },
      log,
    )

    task.metadata = { ...task.metadata, deploymentUrl: result.url, dashboardUrl: result.dashboardUrl }
    task.markModified('metadata')
    return `## 🚀 Auto-deployed to Render\n\nYour changes are being rebuilt${result.url ? ` — live at **[${result.url}](${result.url})**` : ''} in a few minutes.${result.dashboardUrl ? `\n\n[Render dashboard](${result.dashboardUrl})` : ''}`
  } catch (err: any) {
    await log(`Auto-deploy to Render failed: ${err.message}`, 'warn')
    return `## ⚠️ Auto-deploy to Render failed\n\n${err.message}\n\nYour code changes are saved — run Blitz Deploy to redeploy manually.`
  }
}

async function executeAction(
  action: Action,
  root: string,
  changes: Map<string, IFileChange>,
  log: (msg: string, level?: 'info' | 'warn' | 'error') => Promise<void>,
): Promise<string> {
  try {
    switch (action.tool) {
      case 'list_dir': {
        const p = action.path ?? '.'
        await log(`📂 Listing ${p}`)
        return `### list_dir "${p}"\n${tools.listDir(root, p, Math.min(action.depth ?? 1, 3))}`
      }
      case 'read_file': {
        if (!action.path) throw new Error('read_file requires "path"')
        const fromLine = Number(action.start_line) > 1 ? Number(action.start_line) : 1
        await log(`📖 Reading ${action.path}${fromLine > 1 ? ` (from line ${fromLine})` : ''}`)
        return `### read_file "${action.path}"\n\`\`\`\n${tools.readFile(root, action.path, fromLine)}\n\`\`\``
      }
      case 'search': {
        if (!action.query) throw new Error('search requires "query"')
        await log(`🔍 Searching for "${action.query}"`)
        return `### search "${action.query}"\n${tools.searchCode(root, action.query)}`
      }
      case 'edit_file': {
        if (!action.path) throw new Error('edit_file requires "path"')
        if (typeof action.old_string !== 'string' || typeof action.new_string !== 'string') {
          // Give the model a concrete, copy-paste-ready example so it can self-correct.
          throw new Error(
            `edit_file on "${action.path}" is missing the <old>…</old> and <new>…</new> blocks.\n` +
            `Use EXACTLY this XML format (do not use JSON for edit_file):\n\n` +
            `<edit_file path="${action.path}">\n` +
            `<old>\nexact text from the file to replace (copy verbatim)\n</old>\n` +
            `<new>\nreplacement text\n</new>\n` +
            `</edit_file>\n\n` +
            `Read the file first, then copy the exact lines you want to change into <old>.`,
          )
        }
        await log(`✏️ Editing ${action.path}`)
        try {
          const { before, after } = tools.editFile(root, action.path, action.old_string, action.new_string)
          const existing = changes.get(action.path)
          const origBefore = existing?.before ?? before
          const stats = diffStats(origBefore, after)
          const MAX_STORED = 1_000_000
          const truncated = origBefore.length > MAX_STORED || (existing?.truncated ?? false)
          changes.set(action.path, {
            path: action.path,
            before: origBefore.slice(0, MAX_STORED),
            after: after.slice(0, MAX_STORED),
            truncated,
            ...stats,
          })
          await log(`✅ Edited ${action.path} (+${stats.additions}/-${stats.deletions})`)
          return `### edit_file "${action.path}"\nApplied (+${stats.additions}/-${stats.deletions} lines). File now ${after.length} chars.`
        } catch (err: any) {
          await log(`🛡️ edit_file failed on ${action.path}: ${err.message}`, 'warn')
          return `### edit_file "${action.path}"\nFAILED: ${err.message}`
        }
      }
      case 'write_file': {
        if (!action.path) throw new Error('write_file requires "path"')
        const after = tools.stripCodeFence(action.content ?? '')

        // Model echoed a history placeholder instead of real content
        if (after.length < 300 && /(content omitted|saved to disk|not repeated in history|re-read the file)/i.test(after)) {
          await log(`🛡️ Blocked placeholder write to ${action.path}`, 'warn')
          return `### write_file "${action.path}"\nBLOCKED: you sent a history placeholder, not file content. Placeholders like "[wrote … saved to disk]" are notes in YOUR history, never valid file content. Resend the COMPLETE actual file content.`
        }

        // Destructive-write guard: replacing a substantial file with a small
        // fraction of its size is almost always the model gutting it by accident.
        // Two tiers, both intentionally strict — the previous 10%/25% cliffs
        // let a 57KB → 22KB stylesheet through (61% deletion) that ruined the
        // user's site. If the model genuinely wants a smaller file it can trim
        // in multiple passes.
        //   • Soft: 66% cliff — file may not lose more than 1/3 in one write
        //     without confirm="true". Catches "fix one section" turning into
        //     "rewrite half the file".
        //   • Hard: 40% cliff — confirm="true" CANNOT bypass. A single write
        //     that deletes more than 60% of an existing file is treated as an
        //     accident regardless of what the model claims to intend.
        const current = tools.readFileRaw(root, action.path)
        const HARD_KEEP_RATIO = 0.40 // must retain >=40% of original size
        const SOFT_KEEP_RATIO = 0.66 // must retain >=66% of original size (unless confirm)
        if (current.length > 1_000 && after.length < current.length * HARD_KEEP_RATIO) {
          await log(`🛡️ HARD-BLOCKED destructive write to ${action.path} (${current.length} → ${after.length} chars, confirm=${!!action.confirm})`, 'warn')
          const snapshot = current.length <= 8_000
            ? `\n\nCurrent content of ${action.path} for reference:\n\`\`\`\n${current}\n\`\`\``
            : ''
          return `### write_file "${action.path}"\nHARD-BLOCKED: this write would shrink ${action.path} from ${current.length} to ${after.length} chars — a ${Math.round((1 - after.length / current.length) * 100)}% deletion. confirm="true" DOES NOT bypass this tier. This much loss is almost always accidental (partial read, context truncation, or the model regenerating from memory instead of preserving what it hasn't seen). Preserve the existing content and apply your fix on top: add rules for the section you were asked to change, do NOT delete rules for other sections. If a real trim is needed, do it in several separate write_file calls each staying within the guard.${snapshot}`
        }
        if (!action.confirm && current.length > 1_000 && after.length < current.length * SOFT_KEEP_RATIO) {
          await log(`🛡️ Blocked suspicious write to ${action.path} (${current.length} → ${after.length} chars)`, 'warn')
          const snapshot = current.length <= 8_000
            ? `\n\nCurrent content of ${action.path} for reference:\n\`\`\`\n${current}\n\`\`\``
            : ''
          return `### write_file "${action.path}"\nBLOCKED: this would shrink ${action.path} from ${current.length} to ${after.length} chars (a ${Math.round((1 - after.length / current.length) * 100)}% reduction). Small requests almost never justify losing that much content — the rules you didn't touch belong to other sections the user still needs. Resend the COMPLETE file with only your specific edits applied on top of the original content. If you truly need to drop that much, retry with confirm="true".${snapshot}`
        }

        const { before } = tools.writeFile(root, action.path, after)
        const existing = changes.get(action.path)
        const origBefore = existing?.before ?? before
        const stats = diffStats(origBefore, after)
        // Cap stored content so a huge file can't blow past Mongo's 16MB doc limit
        const MAX_STORED = 1_000_000
        const truncated = origBefore.length > MAX_STORED || (existing?.truncated ?? false)
        changes.set(action.path, {
          path: action.path,
          before: origBefore.slice(0, MAX_STORED),
          after: after.slice(0, MAX_STORED),
          truncated,
          ...stats,
        })
        await log(`✏️ Wrote ${action.path} (+${stats.additions}/-${stats.deletions})`)
        return `### write_file "${action.path}"\nSaved (${after.length} chars).`
      }
      case 'run_command': {
        if (!action.command) throw new Error('run_command requires "command"')
        await log(`💻 Running: ${action.command}`)
        const { output, exitCode, timedOut } = await tools.runCommand(root, action.command)
        const status = timedOut ? 'TIMED OUT after 3 minutes' : `exit code ${exitCode}`
        await log(timedOut ? `⏱ Command timed out` : `↳ Exit code ${exitCode}`, exitCode === 0 ? 'info' : 'warn')
        return `### run_command "${action.command}"\n${status}\n\`\`\`\n${output}\n\`\`\``
      }
      default:
        return `### ${action.tool}\nUnknown tool "${action.tool}". Valid tools: list_dir, read_file, search, edit_file, write_file, run_command, done.`
    }
  } catch (err: any) {
    await log(`⚠️ ${action.tool} failed: ${err.message}`, 'warn')
    return `### ${action.tool}\nERROR: ${err.message}`
  }
}

function safeTool(fn: () => string): string {
  try { return fn() } catch (err: any) { return `(error: ${err.message})` }
}

function diffStats(before: string, after: string): { additions: number; deletions: number } {
  const a = before.split('\n')
  const b = after.split('\n')
  return {
    additions: b.filter((l) => !a.includes(l)).length,
    deletions: a.filter((l) => !b.includes(l)).length,
  }
}
