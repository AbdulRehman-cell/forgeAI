// vscode-extension/src/folderScanner.ts — skeleton-mode for 8k-token models
import * as vscode from 'vscode'

const INCLUDE = '**/*.{ts,tsx,js,jsx,mjs,cjs,py,go,rs,java,rb,php,html,css,scss,json,vue,svelte}'
const EXCLUDE = '**/{node_modules,.git,dist,build,out,coverage,__pycache__,venv,.venv,.next,vendor}/**'
const MAX_FILES = 40
const SKELETON_BUDGET = 16_000   // chars for condensed payload (~4k tokens)
const PER_FILE_SKELETON = 1_400

export interface FolderFile { path: string; content: string }

/** Lines that carry cross-file linkage information */
function condense(path: string, content: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const lines = content.split('\n')
  const keep: string[] = []

  const jsPatterns = /^(\s*)(import\s|export\s|from\s|const\s.*=\s*require|module\.exports|exports\.|function\s|async\s+function|class\s|const\s+\w+\s*=\s*(\(|async|function)|def\s|@)/
  const linkPatterns = /(getElementById|querySelector|addEventListener|fetch\(|axios\.|\.emit\(|\.on\(|require\(|innerHTML|onclick)/

  if (ext === 'css' || ext === 'scss') {
    // selectors only — enough to match class/id usage across files
    for (const l of lines) {
      const t = l.trim()
      if (t.endsWith('{')) keep.push(t.replace('{', '').trim())
    }
    return keep.slice(0, 80).join('\n')
  }

  if (ext === 'html' || ext === 'vue' || ext === 'svelte') {
    for (const l of lines) {
      const t = l.trim()
      if (/(id=|class=|src=|href=|onclick=|onsubmit=|<script|<link|<form|<button|<input)/.test(t)) {
        keep.push(t.slice(0, 160))
      }
    }
    return keep.slice(0, 80).join('\n')
  }

  if (ext === 'json') {
    return content.slice(0, 600) // manifests: head is enough
  }

  // Code files: declarations + cross-file link lines, with line numbers
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (jsPatterns.test(l) || linkPatterns.test(l)) {
      keep.push(`${i + 1}: ${l.trim().slice(0, 160)}`)
    }
  }
  return keep.slice(0, 90).join('\n')
}

export interface ScanResult {
  skeletons: FolderFile[]                  // condensed — send to analyze
  fullContents: Map<string, string>        // path → full content (for fix stage)
  root: vscode.Uri
}

export async function scanWorkspace(): Promise<ScanResult | null> {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) return null

  const uris = await vscode.workspace.findFiles(INCLUDE, EXCLUDE, 300)
  const entries: { uri: vscode.Uri; rel: string; size: number }[] = []
  for (const uri of uris) {
    try {
      const stat = await vscode.workspace.fs.stat(uri)
      if (stat.size > 300_000) continue
      entries.push({ uri, rel: vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/'), size: stat.size })
    } catch {}
  }
  entries.sort((a, b) => a.size - b.size)

  const skeletons: FolderFile[] = []
  const fullContents = new Map<string, string>()
  let used = 0

  for (const e of entries.slice(0, MAX_FILES)) {
    try {
      const bytes = await vscode.workspace.fs.readFile(e.uri)
      const content = new TextDecoder().decode(bytes)
      if (content.includes('\u0000')) continue
      fullContents.set(e.rel, content)

      let sk = condense(e.rel, content)
      if (sk.length > PER_FILE_SKELETON) sk = sk.slice(0, PER_FILE_SKELETON) + '\n…'
      if (!sk.trim()) sk = '(no declarations found)'
      if (used + sk.length > SKELETON_BUDGET) break
      skeletons.push({ path: e.rel, content: sk })
      used += sk.length
    } catch {}
  }
  return { skeletons, fullContents, root: folder.uri }
}

/** Editor diagnostics, compact */
export function collectDiagnostics(): string[] {
  const out: string[] = []
  for (const [uri, diags] of vscode.languages.getDiagnostics()) {
    const rel = vscode.workspace.asRelativePath(uri, false)
    for (const d of diags) {
      if (d.severity !== vscode.DiagnosticSeverity.Error) continue
      out.push(`${rel}:${d.range.start.line + 1} ${d.message.slice(0, 120)}`)
      if (out.length >= 20) return out
    }
  }
  return out
}

export async function applyFixes(root: vscode.Uri, fixes: { path: string; content: string }[]): Promise<string[]> {
  const applied: string[] = []
  for (const fix of fixes) {
    const clean = fix.path.replace(/^[/\\]+/, '')
    if (clean.includes('..')) continue
    try {
      await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(root, clean), new TextEncoder().encode(fix.content))
      applied.push(clean)
    } catch {}
  }
  return applied
}
