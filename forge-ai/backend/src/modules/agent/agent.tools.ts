// Tools the Forge Agent can use against a local workspace folder.
// All paths are resolved inside the workspace root — attempts to escape throw.

import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '__pycache__', 'dist', 'build', '.next',
  'venv', '.venv', 'coverage', '.turbo', 'out', 'target', '.idea', '.vscode',
])

// Keep tool outputs small — GitHub Models (default provider) has a tight
// per-request input limit; big payloads come back as HTTP 413
const MAX_FILE_CHARS = 12_000
const MAX_CMD_OUTPUT = 8_000
const CMD_TIMEOUT_MS = 180_000

export function resolveSafe(root: string, rel: string): string {
  const rootAbs = path.resolve(root)
  const abs = path.resolve(rootAbs, rel)
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) {
    throw new Error(`Path escapes the workspace: ${rel}`)
  }
  return abs
}

export function listDir(root: string, rel = '.', depth = 1): string {
  const abs = resolveSafe(root, rel)
  const lines: string[] = []

  function walk(dir: string, prefix: string, level: number) {
    let items: fs.Dirent[]
    try { items = fs.readdirSync(dir, { withFileTypes: true }) } catch (err: any) {
      lines.push(`${prefix}(cannot read: ${err.message})`)
      return
    }
    const sorted = items
      .filter((i) => !IGNORE_DIRS.has(i.name))
      .sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1))

    for (const item of sorted) {
      if (lines.length > 400) { lines.push(`${prefix}… (truncated)`); return }
      if (item.isDirectory()) {
        lines.push(`${prefix}${item.name}/`)
        if (level < depth) walk(path.join(dir, item.name), prefix + '  ', level + 1)
      } else {
        let size = 0
        try { size = fs.statSync(path.join(dir, item.name)).size } catch {}
        lines.push(`${prefix}${item.name} (${formatSize(size)})`)
      }
    }
  }

  walk(abs, '', 0)
  return lines.length ? lines.join('\n') : '(empty directory)'
}

export function readFile(root: string, rel: string, startLine = 1): string {
  const abs = resolveSafe(root, rel)
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${rel}`)
  const stat = fs.statSync(abs)
  if (stat.isDirectory()) throw new Error(`${rel} is a directory — use list_dir`)
  if (stat.size > 2_000_000) throw new Error(`File too large (${formatSize(stat.size)})`)
  const content = fs.readFileSync(abs, 'utf-8')
  if (content.length <= MAX_FILE_CHARS && startLine <= 1) return content

  // Large file — return a page of lines, tell the model how to get the rest
  const lines = content.split('\n')
  const total = lines.length
  const from = Math.min(Math.max(1, startLine), total)
  let out = ''
  let end = from - 1
  for (let i = from - 1; i < total; i++) {
    if (out.length + lines[i].length + 1 > MAX_FILE_CHARS) break
    out += lines[i] + '\n'
    end = i + 1
  }
  const header = end < total
    ? `(PARTIAL: lines ${from}-${end} of ${total}. Read the rest with {"tool":"read_file","path":"${rel}","start_line":${end + 1}} — do NOT rewrite this file until you have seen all of it)`
    : `(lines ${from}-${end} of ${total} — end of file)`
  return `${header}\n${out}`
}

/** Full current content, no paging/caps — for internal guards, not the model */
export function readFileRaw(root: string, rel: string): string {
  const abs = resolveSafe(root, rel)
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return ''
  return fs.readFileSync(abs, 'utf-8')
}

export function writeFile(root: string, rel: string, content: string): { before: string; existed: boolean } {
  const abs = resolveSafe(root, rel)
  const existed = fs.existsSync(abs)
  const before = existed ? fs.readFileSync(abs, 'utf-8') : ''
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content, 'utf-8')
  return { before, existed }
}

export interface EditResult {
  before: string
  after: string
}

/**
 * Surgical string replacement — the tool the agent needs when its context is
 * smaller than the file it wants to edit. Finds `oldString` inside the file
 * and replaces it with `newString`, keeping everything else exactly as-is.
 * Errors if `oldString` isn't unique — forcing the caller to expand the match
 * (add surrounding context) rather than silently editing the wrong rule.
 */
export function editFile(root: string, rel: string, oldString: string, newString: string): EditResult {
  const abs = resolveSafe(root, rel)
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${rel}`)
  const before = fs.readFileSync(abs, 'utf-8')
  if (!oldString.length) throw new Error('edit_file: old_string is empty')
  if (oldString === newString) throw new Error('edit_file: old_string equals new_string — nothing to change')
  const first = before.indexOf(oldString)
  if (first === -1) {
    throw new Error(`edit_file: old_string not found in ${rel}. The text must match EXACTLY (whitespace, punctuation, casing). Read the file again and copy the block verbatim.`)
  }
  const second = before.indexOf(oldString, first + 1)
  if (second !== -1) {
    throw new Error(`edit_file: old_string matches ${rel} in multiple places (first at char ${first}, again at char ${second}). Add more surrounding context to make it unique.`)
  }
  const after = before.slice(0, first) + newString + before.slice(first + oldString.length)
  fs.writeFileSync(abs, after, 'utf-8')
  return { before, after }
}

export function searchCode(root: string, query: string): string {
  const matches: string[] = []
  const lower = query.toLowerCase()

  function walk(dir: string, depth: number) {
    if (depth > 8 || matches.length >= 60) return
    let items: fs.Dirent[]
    try { items = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const item of items) {
      if (matches.length >= 60) return
      if (item.name.startsWith('.') || IGNORE_DIRS.has(item.name)) continue
      const full = path.join(dir, item.name)
      if (item.isDirectory()) { walk(full, depth + 1); continue }
      try {
        const stat = fs.statSync(full)
        if (stat.size > 500_000) continue
        const content = fs.readFileSync(full, 'utf-8')
        if (content.includes('\0')) continue // binary
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(lower)) {
            matches.push(`${path.relative(root, full)}:${i + 1}: ${lines[i].trim().slice(0, 200)}`)
            if (matches.length >= 60) break
          }
        }
      } catch {}
    }
  }

  walk(path.resolve(root), 0)
  return matches.length ? matches.join('\n') : `No matches for "${query}"`
}

export function runCommand(
  root: string,
  command: string,
  timeoutMs = CMD_TIMEOUT_MS,
): Promise<{ output: string; exitCode: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    const proc = process.platform === 'win32'
      ? spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { cwd: root, windowsHide: true })
      : spawn('bash', ['-lc', command], { cwd: root })

    let output = ''
    let timedOut = false
    const append = (d: Buffer) => {
      if (output.length < MAX_CMD_OUTPUT) output += d.toString('utf-8')
    }
    proc.stdout.on('data', append)
    proc.stderr.on('data', append)

    const timer = setTimeout(() => {
      timedOut = true
      try { proc.kill() } catch {}
    }, timeoutMs)

    proc.on('error', (err) => {
      clearTimeout(timer)
      resolve({ output: `Failed to start command: ${err.message}`, exitCode: null, timedOut: false })
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (output.length >= MAX_CMD_OUTPUT) output += '\n… (output truncated)'
      resolve({ output: output.trim() || '(no output)', exitCode: code, timedOut })
    })
  })
}

/**
 * Models sometimes wrap an entire file body in a markdown code fence
 * (```Dockerfile … ```). Written to disk verbatim that breaks builds —
 * unwrap it. Only strips when the fence spans the whole content.
 */
export function stripCodeFence(content: string): string {
  // Whole content is one balanced fenced block (the common case)
  const m = content.match(/^\s*```[^\r\n]*\r?\n([\s\S]*?)\r?\n?```\s*$/)
  if (m) return m[1]
  // Unbalanced fences — e.g. the model forgot the closing fence, or a
  // continuation was stitched in. Written verbatim these break builds
  // ("unknown instruction: ```Dockerfile"), so strip each end independently.
  return content
    .replace(/^\s*```[^\r\n]*\r?\n/, '')
    .replace(/\r?\n```\s*$/, '')
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}
