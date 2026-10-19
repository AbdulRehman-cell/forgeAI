import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import { Repository } from '../repository/repository.model'
import { User } from '../users/user.model'
import { createProvider } from './ai.factory'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { Chat } from './chat.model'
import { Task } from '../tasks/task.model'
import { resolveAttachments, ImageAttachment } from '../../lib/imageAttachments'

const router = Router()


// ═══ Local mode: fix/explain raw code — NO repository needed ═══
// Used by the VS Code extension to work on any local file/folder.

// ─── Fix raw code ─────────────────────────────────────────
router.post('/fix-code', async (req, res) => {
  const { code, fileName } = req.body
  if (!code?.trim()) return res.status(400).json({ message: 'code is required' })

  const provider = createProvider('github')
  try {
    const response = await provider.chat(
      [
        {
          role: 'user',
          content: `Fix all bugs, errors, and code-quality issues in this file (${fileName ?? 'unknown'}).
Return ONLY the complete fixed file content inside a single code block. No explanations before or after.

\`\`\`
${code.slice(0, 40_000)}
\`\`\``,
        },
      ],
      "You are ForgeAI, an expert software engineer. Return complete, working code. Preserve the author's style and formatting conventions.",
    )

    // Extract code from the fenced block; fall back to raw content
    const match = response.content.match(/```(?:\w+)?\n([\s\S]+?)\n```/)
    const fixed = match ? match[1] : response.content

    res.json({ fixed })
  } catch (err: any) {
    console.error('[ai/fix-code]', err.response?.data ?? err.message)
    res.status(500).json({ message: err.response?.data?.error?.message ?? err.message ?? 'AI request failed' })
  }
})

// ─── Explain raw code ─────────────────────────────────────
router.post('/explain-code', async (req, res) => {
  const { code, fileName } = req.body
  if (!code?.trim()) return res.status(400).json({ message: 'code is required' })

  const provider = createProvider('github')
  try {
    const response = await provider.chat(
      [
        {
          role: 'user',
          content: `Explain this file (${fileName ?? 'unknown'}): its purpose, structure, key functions, and any issues you notice.

\`\`\`
${code.slice(0, 40_000)}
\`\`\``,
        },
      ],
      'You are ForgeAI, an expert software engineer. Be clear and concise.',
    )
    res.json({ explanation: response.content })
  } catch (err: any) {
    console.error('[ai/explain-code]', err.response?.data ?? err.message)
    res.status(500).json({ message: err.response?.data?.error?.message ?? err.message ?? 'AI request failed' })
  }
})

// Strip self-referential identity leaks before sending responses to the client
function sanitizeIdentity(text: string): string {
  return text
    .replace(/\b(I(?:'m| am)(?: a| an)?(?: large language model)?(?: (?:trained|developed|created|built|made))?(?: by| from)?\s*(?:Google|Anthropic|OpenAI|Meta|DeepMind))\b/gi,
      "I'm ForgeAI, built by the FORCAIS team")
    .replace(/\bI(?:'m| am) Gemini\b/gi, "I'm ForgeAI")
    .replace(/\bI(?:'m| am) Claude\b/gi, "I'm ForgeAI")
    .replace(/\bI(?:'m| am) ChatGPT\b/gi, "I'm ForgeAI")
    .replace(/\bThe Gemini (?:family of )?models?\b/gi, 'ForgeAI')
    .replace(/\bGemini (?:Ultra|Pro|Flash|Nano|1[\s.]5|2[\s.]0|[\d.]+)\b/gi, 'ForgeAI')
    .replace(/\btrained by (?:Google|Anthropic|OpenAI|Meta)\b/gi, 'built by the FORCAIS team')
    .replace(/\bdeveloped by (?:Google|Anthropic|OpenAI|Meta)\b/gi, 'developed by FORCAIS')
    .replace(/\bcreated by (?:Google|Anthropic|OpenAI|Meta)\b/gi, 'created by FORCAIS')
    .replace(/\bGoogle(?:'s)? (?:AI|language model|assistant|DeepMind)\b/gi, "ForgeAI")
    .replace(/\bAnthropic(?:'s)? (?:AI|model|assistant)\b/gi, "ForgeAI")
    .replace(/\bsubsidiary of Alphabet\b/gi, 'FORCAIS')
    .replace(/\bAlphabet Inc\./gi, 'FORCAIS')
    .replace(/\bSundar Pichai\b/gi, 'Abdul Rehman Ishaque')
}

router.use(requireAuth)

// ─── General-purpose AI chat (no repository context) ─────
router.post('/general-chat', async (req, res) => {
  const { message, history } = req.body as {
    message: string
    history?: { role: 'user' | 'assistant'; content: string }[]
  }
  if (!message?.trim()) return res.status(400).json({ message: 'Message is required' })

  const provider = createProvider('gemini')

  const systemPrompt = `You are ForgeAI Assistant — the intelligent chat interface built into ForgeAI, a product by FORCAIS.

COMPANY IDENTITY (answer these questions exactly as stated, never deviate):
- Company name: ForgeAI / FORCAIS
- Founder & Owner: Abdul Rehman Ishaque — a passionate tech entrepreneur who proudly calls himself a "tech nerd"
- What you are: ForgeAI's AI assistant, powered by a proprietary blend of advanced language models developed and curated by the ForgeAI team

STRICT RULES — follow these absolutely, no exceptions:
1. NEVER reveal, hint at, or acknowledge which underlying AI models, companies, or technologies power you (no Google, Gemini, Claude, Anthropic, OpenAI, Meta, Llama, Groq, or any other name)
2. If asked "who made you", "what model are you", "are you GPT/Gemini/Claude" — respond: "I'm ForgeAI Assistant, built by the FORCAIS team. Our AI runs on a proprietary blend of models — we don't share the specifics of our tech stack."
3. If asked about the owner or founder — proudly say: "ForgeAI was founded by Abdul Rehman Ishaque, a self-described tech nerd with a passion for building intelligent tools."
4. If asked about the company — say: "ForgeAI is a product of FORCAIS, focused on making powerful AI tools accessible to everyone."
5. You are NOT Google. You are NOT Gemini. You are NOT Claude. You are ForgeAI Assistant. Stay in character at all times.

YOUR CAPABILITIES — you excel at:
- Brainstorming and creative ideation
- Explaining complex concepts clearly and accurately
- Helping with writing, planning, and strategy
- Answering questions across any domain
- Problem-solving and critical thinking

Be helpful, concise, and conversational. Format responses with clear structure when useful.

At the very END of your response, append EXACTLY this block:
<<<FOLLOWUPS>>>
- <a relevant follow-up question or idea, under 10 words>
- <another follow-up>
- <a third follow-up>
<<<END>>>`

  const messages = [
    ...(history ?? []).slice(-12),
    { role: 'user' as const, content: message },
  ]

  try {
    const response = await provider.chat(messages, systemPrompt)
    let answer = response.content
    let followups: string[] = []
    const fuMatch = answer.match(/<<<FOLLOWUPS>>>([\s\S]*?)<<<END>>>/)
    if (fuMatch) {
      followups = fuMatch[1]
        .split('\n')
        .map((l) => l.replace(/^-\s*/, '').trim())
        .filter(Boolean)
        .slice(0, 3)
      answer = answer.replace(/<<<FOLLOWUPS>>>[\s\S]*?<<<END>>>/, '').trim()
    }
    res.json({ response: sanitizeIdentity(answer), followups })
  } catch (err: any) {
    console.error('[ai/general-chat]', err.response?.data ?? err.message)
    res.status(500).json({ message: err.response?.data?.error?.message ?? err.message ?? 'AI request failed' })
  }
})

// ─── GET history ──────────────────────────────────────────
router.get('/chat/:repositoryId', async (req, res) => {
  const user = req.user as any
  const { repositoryId } = req.params
  const chat = await Chat.findOne({ userId: user._id, repositoryId })
  res.json({ messages: chat?.messages ?? [] })
})

// ─── DELETE (clear) history ───────────────────────────────
router.delete('/chat/:repositoryId', async (req, res) => {
  const user = req.user as any
  const { repositoryId } = req.params
  await Chat.findOneAndUpdate(
    { userId: user._id, repositoryId },
    { $set: { messages: [] } }
  )
  res.json({ message: 'Cleared' })
})

// ═══ Whole-codebase context builder ═══════════════════════
const IGNORE_DIRS = new Set([
  'node_modules', '.git', '__pycache__', 'dist', 'build', '.next',
  'venv', '.venv', 'coverage', '.turbo', '.cache', 'out', '.vercel',
])
const IGNORE_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.DS_Store',
])
const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs',
  '.java', '.kt', '.rb', '.php', '.cs', '.cpp', '.c', '.h', '.swift',
  '.html', '.css', '.scss', '.sass', '.less', '.vue', '.svelte',
  '.json', '.yaml', '.yml', '.toml', '.xml', '.md', '.txt', '.env',
  '.sql', '.sh', '.bash', '.dockerfile', '.gitignore',
])

// GitHub Models (default provider) caps requests at 8000 tokens (~32k chars
// for EVERYTHING: system prompt, codebase context, history, and images).
// Budget accordingly and shrink-retry on overflow.
const MAX_TOTAL_CHARS = Number(process.env.CHAT_CONTEXT_CHARS ?? 18_000)
const MAX_FILE_CHARS = 8_000

interface RepoFile { rel: string; content: string; size: number }

function collectAllFiles(root: string): RepoFile[] {
  const files: RepoFile[] = []

  function walk(dir: string, depth = 0) {
    if (depth > 10) return
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) continue
      if (IGNORE_FILES.has(entry.name)) continue
      const full = path.join(dir, entry.name)

      if (entry.isDirectory()) { walk(full, depth + 1); continue }

      const ext = path.extname(entry.name).toLowerCase()
      const isDockerfile = entry.name === 'Dockerfile' || entry.name.toLowerCase().includes('dockerfile')
      const isDotfile = entry.name.startsWith('.') && TEXT_EXT.has(ext)
      if (!TEXT_EXT.has(ext) && !isDockerfile && !isDotfile) continue

      try {
        const stat = fs.statSync(full)
        if (stat.size > 500_000) continue
        let content = fs.readFileSync(full, 'utf-8')
        if (content.includes('\u0000')) continue
        if (content.length > MAX_FILE_CHARS) {
          content = content.slice(0, MAX_FILE_CHARS) + '\n... [truncated]'
        }
        files.push({ rel: path.relative(root, full), content, size: stat.size })
      } catch {}
    }
  }

  walk(root)

  const priority = (f: RepoFile) => {
    const base = path.basename(f.rel).toLowerCase()
    if (['index.html', 'index.ts', 'index.js', 'main.py', 'app.py', 'app.ts', 'app.js', 'server.js', 'main.ts'].includes(base)) return 0
    if (base === 'readme.md') return 1
    if (base.endsWith('.css') || base.endsWith('.js') || base.endsWith('.ts')) return 2
    return 3
  }
  return files.sort((a, b) => priority(a) - priority(b) || a.size - b.size)
}

function buildCodebaseContext(root: string, budget = MAX_TOTAL_CHARS): { context: string; included: string[]; total: number } {
  const files = collectAllFiles(root)
  const parts: string[] = []
  const included: string[] = []
  let used = 0

  for (const f of files) {
    const block = `\n### FILE: ${f.rel}\n\`\`\`\n${f.content}\n\`\`\`\n`
    if (used + block.length > budget) {
      const remaining = files.filter((x) => !included.includes(x.rel)).map((x) => x.rel)
      if (remaining.length) {
        parts.push(`\n### (${remaining.length} more files not shown due to size: ${remaining.join(', ')})\n`)
      }
      break
    }
    parts.push(block)
    included.push(f.rel)
    used += block.length
  }

  return { context: parts.join(''), included, total: files.length }
}

// ─── POST send message ────────────────────────────────────
router.post('/chat', async (req, res) => {
  const user = req.user as any
  const { repositoryId, message, images } = req.body as {
    repositoryId: string
    message: string
    images?: ImageAttachment[]
  }

  if (!message?.trim() && !images?.length)
    return res.status(400).json({ message: 'Message is required' })

  // OCR-first attachments: text-bearing images become text blocks; only
  // text-free images are sent to the model as actual images
  const { ocrText, dataUrls } = resolveAttachments(images, user._id.toString())

  const repo = await Repository.findOne({ _id: repositoryId, userId: user._id })
  if (!repo) return res.status(404).json({ message: 'Repository not found' })

  // ═══ Build context from the codebase, sized to a budget ═══
  // Vision images eat a big chunk of the request cap — leave them room
  let contextBudget = dataUrls.length ? Math.min(MAX_TOTAL_CHARS, 8_000) : MAX_TOTAL_CHARS
  let citedFiles: string[] = []
  const buildContext = async (budget: number): Promise<string> => {
    if (repo.localPath && fs.existsSync(repo.localPath)) {
      const built = buildCodebaseContext(repo.localPath, budget)
      citedFiles = built.included
      return built.context
    }
    try {
      const { data } = await axios.post(
        `${process.env.PYTHON_SERVICE_URL}/repo/context`,
        { path: repo.localPath, query: message },
        { timeout: 5000 },
      )
      return (data.context ?? '').slice(0, budget)
    } catch { return '' }
  }
  let context = await buildContext(contextBudget)

  const recentTasks = await Task.find({
    userId: user._id,
    repositoryId,
    status: 'completed',
    type: { $in: ['fix_workspace', 'fix_file', 'fix_folder', 'blitz_deploy'] },
  })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean()

  const changesContext = recentTasks.length
    ? recentTasks
        .map((t) => {
          const files = t.changes?.map((c: any) => `  - ${c.path} (+${c.additions}/-${c.deletions})`).join('\n') ?? ''
          return `[${new Date(t.createdAt).toLocaleDateString()}] ${t.summary ?? 'Fix task'}\n${files}`
        })
        .join('\n\n')
    : ''

  let chat =
    (await Chat.findOne({ userId: user._id, repositoryId })) ||
    (await Chat.create({ userId: user._id, repositoryId, messages: [] }))

  // Persist what the model effectively sees: the message, any OCR-extracted
  // text, and a marker for images that went through as vision input
  const imageMarkers = (images ?? [])
    .filter((i) => !(i.hasText && i.text?.trim()))
    .map((i) => `\n\n[attached image: ${i.originalName ?? i.url}]`)
    .join('')
  const storedContent = `${message?.trim() ?? ''}${ocrText}${imageMarkers}`.trim()

  chat.messages.push({ role: 'user', content: storedContent, timestamp: new Date() })
  await chat.save()

  // Chat always runs on the free GitHub+Gemini stack — Claude is reserved for
  // the builder's QA pass, not conversational turns.
  const provider = createProvider('github')

  const makeSystemPrompt = (ctx: string) => `You are ForgeAI, an expert software engineer assistant built by FORCAIS.

IDENTITY RULES (absolute — never break these):
- You are ForgeAI, built by FORCAIS. Founder: Abdul Rehman Ishaque, a proud "tech nerd".
- NEVER reveal or hint at which underlying AI models or companies power you (no Google, Gemini, Claude, Anthropic, OpenAI, etc.)
- If asked: "I'm ForgeAI, FORCAIS's AI assistant. We run on a proprietary blend of models — we keep our tech stack private."

You are analyzing the repository: ${repo.fullName}
Language: ${repo.language ?? 'Unknown'}

You have the FULL source code of this repository below. Every file the user asks
about is included here — read it directly. Never say a file wasn't provided; if
it's listed below, its contents are right there. If a file truly isn't in the
list, say so and name the files you can see.

════════ FULL CODEBASE ════════
${ctx || '(no files found on disk)'}
════════ END CODEBASE ════════

${changesContext ? `RECENT AI-APPLIED FIXES (changes you already made):\n${changesContext}\n` : ''}

Answer clearly and precisely, quoting exact values from the files above when asked.
When suggesting code changes, show the full modified file or function.

At the very END of your response, append EXACTLY this block:
<<<FOLLOWUPS>>>
- <a relevant follow-up question about this codebase, under 10 words>
- <another follow-up question>
- <a third follow-up question>
<<<END>>>`

  try {
    // Cap history so old long messages can't blow the request limit
    const history: any[] = chat.messages.slice(-12).map((m) => ({
      role: m.role,
      content: m.content.length > 3_000 ? m.content.slice(0, 3_000) + '\n… (trimmed)' : m.content,
    }))

    // Text-free images ride along on the current message as vision input
    if (dataUrls.length && history.length) {
      history[history.length - 1].images = dataUrls
    }

    // Shrink-and-retry when the provider rejects the request as too large
    let response: { content: string } | undefined
    for (let attempt = 0; ; attempt++) {
      try {
        response = await provider.chat(history, makeSystemPrompt(context))
        break
      } catch (err: any) {
        const tooBig =
          err.response?.status === 413 ||
          err.response?.data?.error?.code === 'tokens_limit_reached' ||
          /too large|tokens_limit/i.test(err.response?.data?.error?.message ?? '')
        if (!tooBig || attempt >= 3) throw err
        contextBudget = Math.floor(contextBudget / 2)
        context = await buildContext(contextBudget)
        // Last resort: drop older history too
        if (attempt >= 1) history.splice(0, Math.max(0, history.length - 4))
      }
    }

    let answer = response!.content
    let followups: string[] = []
    const fuMatch = answer.match(/<<<FOLLOWUPS>>>([\s\S]*?)<<<END>>>/)
    if (fuMatch) {
      followups = fuMatch[1]
        .split('\n')
        .map((l) => l.replace(/^-\s*/, '').trim())
        .filter(Boolean)
        .slice(0, 3)
      answer = answer.replace(/<<<FOLLOWUPS>>>[\s\S]*?<<<END>>>/, '').trim()
    }

    chat.messages.push({
      role: 'assistant',
      content: answer,
      timestamp: new Date(),
    })
    await chat.save()

    res.json({
      response: sanitizeIdentity(answer),
      citations: citedFiles.slice(0, 12),
      followups,
    })
  } catch (err: any) {
    console.error('[ai] error:', err.response?.data ?? err.message)
    res.status(500).json({
      message:
        err.response?.data?.error?.message ??
        err.message ??
        'AI request failed',
    })
  }
})/// ═══ REPLACE the /analyze-folder route in ai.routes.ts with these TWO routes ═══
// Tuned for GitHub Models' 8k-token request cap: analysis runs on file
// SKELETONS (imports/exports/signatures), fixes run on only the involved files.

// ─── Stage 1: cross-file analysis on skeletons ────────────
router.post('/analyze-folder', async (req, res) => {
  const { files, diagnostics } = req.body as {
    files: { path: string; content: string }[]
    diagnostics?: string[]
  }
  if (!files?.length) return res.status(400).json({ message: 'files[] required' })

  // Hard cap for the 8k-token model: ~20k chars total input
  let used = 0
  const blocks: string[] = []
  for (const f of files) {
    const block = `## ${f.path}\n${f.content}\n`
    if (used + block.length > 18_000) break
    blocks.push(block)
    used += block.length
  }

  const provider = createProvider('github')
  const prompt = `Below are SKELETONS of every file in a project: imports, exports, function/class signatures (with line numbers), HTML ids/classes/handlers, and CSS selectors. Bodies are omitted.

Find CROSS-FILE bugs by matching these links:
- imports that don't match any export (name/path/spelling)
- calls whose argument count/names mismatch the signature in another file
- HTML ids/classes/handlers with no matching JS/CSS (and vice versa)
- frontend fetch/axios paths that match no route

${blocks.join('\n')}
${diagnostics?.length ? `\nEDITOR ERRORS:\n${diagnostics.slice(0, 15).join('\n')}` : ''}

Reply with ONLY JSON:
{"summary":"1-2 sentences","issues":[{"severity":"critical|high|medium|low","title":"...","files":["symptom.js","cause.js"],"description":"cause file vs symptom file","fix_hint":"..."}]}`

  try {
    const response = await provider.chat(
      [{ role: 'user', content: prompt }],
      'You are ForgeAI Buddy, expert at whole-project reasoning. Strict JSON only.',
    )
    const raw = response.content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    const s = raw.indexOf('{'), e = raw.lastIndexOf('}')
    if (s === -1) throw new Error('AI did not return JSON')
    const parsed = JSON.parse(raw.slice(s, e + 1))
    res.json({ summary: parsed.summary ?? '', issues: parsed.issues ?? [] })
  } catch (err: any) {
    console.error('[ai/analyze-folder]', err.response?.data ?? err.message)
    res.status(500).json({ message: err.response?.data?.error?.message ?? err.message })
  }
})

// ─── Stage 2: fix only the involved files (full contents) ──
router.post('/fix-files', async (req, res) => {
  const { files, issues } = req.body as {
    files: { path: string; content: string }[]   // FULL contents, max ~4 files
    issues: string                                // issue descriptions to fix
  }
  if (!files?.length) return res.status(400).json({ message: 'files[] required' })

  // Budget guard: trim to fit
  let used = 0
  const included: typeof files = []
  for (const f of files.slice(0, 4)) {
    const c = f.content.length > 6000 ? f.content.slice(0, 6000) + '\n/*truncated*/' : f.content
    if (used + c.length > 16_000) break
    included.push({ path: f.path, content: c })
    used += c.length
  }

  const provider = createProvider('github')
  const prompt = `Fix these cross-file issues:
${issues.slice(0, 1500)}

FILES (full contents):
${included.map((f) => `<file path="${f.path}">\n${f.content}\n</file>`).join('\n')}

Return the corrected version of EVERY file that needs changes, in exactly this format, complete contents only:
<file path="the/path">
fixed content
</file>`

  try {
    const response = await provider.chat(
      [{ role: 'user', content: prompt }],
      'You are ForgeAI Buddy. Return complete fixed files in the exact <file> format. No commentary.',
    )
    const fixes: { path: string; content: string }[] = []
    const regex = /<file path="([^"]+)">\n?([\s\S]*?)<\/file>/g
    let m
    while ((m = regex.exec(response.content)) !== null) {
      fixes.push({ path: m[1].trim(), content: m[2].replace(/\n$/, '') })
    }
    res.json({ fixes })
  } catch (err: any) {
    console.error('[ai/fix-files]', err.response?.data ?? err.message)
    res.status(500).json({ message: err.response?.data?.error?.message ?? err.message })
  }
})

// ─── Deep-fix one file with folder context ────────────────
router.post('/fix-file-deep', async (req, res) => {
  const { file, folderContext, findings, diagnostics } = req.body as {
    file: { path: string; content: string }
    folderContext: string      // skeletons of the OTHER files
    findings?: string          // crossref findings involving this file
    diagnostics?: string       // editor errors for this file
  }
  if (!file?.content) return res.status(400).json({ message: 'file required' })

  const provider = createProvider('github')
  const prompt = `You are fixing ONE file inside a project. You have skeletons of every other file so you can keep cross-file links (imports, exports, calls, HTML handlers) consistent.

OTHER FILES (skeletons — imports/exports/signatures):
${(folderContext ?? '').slice(0, 6000)}

${findings ? `KNOWN CROSS-FILE ISSUES INVOLVING THIS FILE:\n${findings.slice(0, 1200)}\n` : ''}${diagnostics ? `EDITOR ERRORS IN THIS FILE:\n${diagnostics.slice(0, 800)}\n` : ''}
FILE TO FIX — ${file.path}:
\`\`\`
${file.content.slice(0, 7000)}
\`\`\`

Fix ALL problems in this file: syntax errors, logic bugs, wrong variable names, broken imports/exports, functions called with wrong params (match the skeletons), missing handlers, bad selectors — everything.
If the file is already correct, reply with exactly: NO_CHANGES
Otherwise reply with ONLY the complete fixed file content inside one code block.`

  try {
    const response = await provider.chat(
      [{ role: 'user', content: prompt }],
      'You are ForgeAI Buddy. Return the complete corrected file or NO_CHANGES. Never return fragments or commentary.',
    )
    const text = response.content.trim()
    if (/^NO_CHANGES/i.test(text)) return res.json({ changed: false })
    const m = text.match(/```(?:\w+)?\n([\s\S]+?)\n```/)
    res.json({ changed: true, content: m ? m[1] : text })
  } catch (err: any) {
    console.error('[ai/fix-file-deep]', err.response?.data ?? err.message)
    res.status(500).json({ message: err.response?.data?.error?.message ?? err.message })
  }
})

export default router