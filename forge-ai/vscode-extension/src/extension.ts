import * as vscode from 'vscode'
import { ForgeAIApi } from './api'
import { TasksProvider } from './tasksProvider'
import { BuddySidebarProvider } from './sidebarProvider'
import { scanWorkspace, collectDiagnostics, applyFixes } from './folderScanner'

let api: ForgeAIApi
let pendingFixes: { path: string; content: string }[] = []
let workspaceRoot: vscode.Uri | undefined

interface RepoPick extends vscode.QuickPickItem {
  id: string
  cloneUrl?: string
  localPath?: string
  source?: string
  github?: any // GitHub repo not yet imported into ForgeAI
}

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('forgeai')
  api = new ForgeAIApi(
    config.get('apiUrl') ?? 'http://localhost:4000/api',
    config.get('token') ?? '',
  )

  // ── Flamboyant sidebar (buttons UI) ──
  const sidebar = new BuddySidebarProvider(async (msg, view) => {
    switch (msg.command) {
      case 'scanFolder':   return scanFolder(sidebar, 'analyze')
      case 'fixFolder':    return scanFolder(sidebar, 'fix')
      case 'applyAll':     return applyAllFixes(sidebar)
      case 'importRepo':   return importRepo()
      case 'fixCurrent':   return vscode.commands.executeCommand('forgeai.fixLocalFile')
      case 'explainCurrent': return vscode.commands.executeCommand('forgeai.explainLocalFile')
      case 'openFile':     return openWorkspaceFile(msg.file)
    }
  })
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(BuddySidebarProvider.viewType, sidebar),
  )

  // ── Tasks tree ──
  const tasksProvider = new TasksProvider(api)
  vscode.window.registerTreeDataProvider('forgeai.tasks', tasksProvider)

  // ── Commands (palette + sidebar both work) ──
  context.subscriptions.push(
    vscode.commands.registerCommand('forgeai.scanFolder', () => scanFolder(sidebar, 'analyze')),
    vscode.commands.registerCommand('forgeai.fixFolder', () => scanFolder(sidebar, 'fix')),
    vscode.commands.registerCommand('forgeai.importRepo', () => importRepo()),
    vscode.commands.registerCommand('forgeai.fixWorkspace', () => fixWorkspace()),
    vscode.commands.registerCommand('forgeai.fixCurrentFile', () => fixCurrentFile()),
    vscode.commands.registerCommand('forgeai.explainFile', () => explainFile()),
    vscode.commands.registerCommand('forgeai.openDashboard', () => openDashboard()),
    vscode.commands.registerCommand('forgeai.fixLocalFile', () => fixLocalFile()),
    vscode.commands.registerCommand('forgeai.explainLocalFile', () => explainLocalFile()),
    vscode.commands.registerCommand('forgeai.setToken', async () => {
      const raw = await vscode.window.showInputBox({
        prompt: 'Paste your ForgeAI token (browser console: JSON.parse(localStorage.getItem("forge-auth")).state.token)',
        password: true, ignoreFocusOut: true,
      })
      if (!raw) return
      let token = raw.trim().replace(/^["']|["']$/g, '')

      // Reject already-expired tokens at paste time — the web app's localStorage
      // can hold a stale token if you haven't logged in recently
      const exp = jwtExpiry(token)
      if (exp && exp < Date.now()) {
        vscode.window.showErrorMessage(
          `That token expired ${new Date(exp).toLocaleString()}. Log OUT of the ForgeAI web app, log back in, then copy the token again — logging in is what mints a fresh one.`,
        )
        return
      }

      // Exchange for a 90-day extension token so this isn't a weekly chore
      let note = ''
      try {
        token = await api.getExtensionToken(token)
        note = ' (valid for 90 days)'
      } catch {
        note = ' (could not extend it — backend unreachable? It will last as long as the web session)'
      }

      // Save globally AND remove any workspace-level override, which would
      // silently win over the global value
      const cfg = vscode.workspace.getConfiguration('forgeai')
      await cfg.update('token', token, vscode.ConfigurationTarget.Global)
      const inspected = cfg.inspect<string>('token')
      if (inspected?.workspaceValue !== undefined) {
        await cfg.update('token', undefined, vscode.ConfigurationTarget.Workspace)
      }
      if (inspected?.workspaceFolderValue !== undefined) {
        try { await cfg.update('token', undefined, vscode.ConfigurationTarget.WorkspaceFolder) } catch {}
      }
      vscode.window.showInformationMessage(`✅ ForgeAI token saved${note}.`)
    }),
  )

  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('forgeai')) {
      const u = vscode.workspace.getConfiguration('forgeai')
      api.updateConfig(u.get('apiUrl') ?? 'http://localhost:4000/api', u.get('token') ?? '')
    }
  })

  vscode.window.showInformationMessage('⚡ ForgeAI Buddy is active — open the ForgeAI sidebar.')
}

async function scanFolder(sidebar: BuddySidebarProvider, mode: 'analyze' | 'fix') {
  const scan = await scanWorkspace()
  if (!scan) {
    vscode.window.showWarningMessage('Open a folder first (File → Open Folder).')
    return
  }
  workspaceRoot = scan.root
  pendingFixes = []

  sidebar.post({
    command: 'busy',
    text: `Scanning ${scan.skeletons.length} files (skeleton mode — fits free AI tier)…`,
  })

  try {
    // ── Stage 1: cross-file analysis on skeletons ──
    const result = await api.analyzeFolder(scan.skeletons, collectDiagnostics())
    const issues = result.issues ?? []

    if (mode === 'analyze' || !issues.length) {
      sidebar.post({ command: 'results', summary: result.summary, issues, fixCount: 0 })
      return
    }

    // ── Stage 2: fetch FULL contents of only the involved files, get fixes ──
    sidebar.post({ command: 'busy', text: `Found ${issues.length} issue(s) — generating fixes for involved files…` })

    const involved = [...new Set(issues.flatMap((i: any) => i.files ?? []))].slice(0, 4) as string[]
    const fullFiles = involved
      .filter((p) => scan.fullContents.has(p))
      .map((p) => ({ path: p, content: scan.fullContents.get(p)! }))

    if (!fullFiles.length) {
      sidebar.post({ command: 'results', summary: result.summary, issues, fixCount: 0 })
      return
    }

    const issueText = issues
      .map((i: any) => `- [${i.severity}] ${i.title}: ${i.description}`)
      .join('\n')

    const fixResult = await api.fixFiles(fullFiles, issueText)
    pendingFixes = fixResult.fixes ?? []

    sidebar.post({ command: 'results', summary: result.summary, issues, fixCount: pendingFixes.length })
    if (pendingFixes.length) {
      vscode.window.showInformationMessage(
        `🤖 Fixes ready for ${pendingFixes.length} file(s) — review issues, then click "Apply All Fixes".`,
      )
    }
  } catch (err: any) {
    sidebar.post({ command: 'idle' })
    vscode.window.showErrorMessage(`ForgeAI: ${err.response?.data?.message ?? err.message}`)
  }
}

async function applyAllFixes(sidebar: BuddySidebarProvider) {
  if (!pendingFixes.length || !workspaceRoot) {
    vscode.window.showWarningMessage('No pending fixes. Run Auto-Fix Folder first.')
    return
  }
  const confirm = await vscode.window.showWarningMessage(
    `Rewrite ${pendingFixes.length} file(s) with ForgeAI fixes? (undo via git or Ctrl+Z per file)`,
    { modal: true }, 'Apply Fixes',
  )
  if (confirm !== 'Apply Fixes') return

  const applied = await applyFixes(workspaceRoot, pendingFixes)
  pendingFixes = []
  sidebar.post({ command: 'results', summary: `✅ Applied fixes to: ${applied.join(', ')}`, issues: [], fixCount: 0 })
  vscode.window.showInformationMessage(`⚡ ForgeAI rewrote ${applied.length} file(s). Check your source control diff to review.`)
}

async function openWorkspaceFile(rel: string) {
  if (!workspaceRoot) return
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(workspaceRoot, rel))
    vscode.window.showTextDocument(doc, { preview: true })
  } catch {
    vscode.window.showWarningMessage(`Could not open ${rel}`)
  }
}

// ═══ Import repo ═══════════════════════════════════════════
// One picker for everything:
//  • GitHub repos not yet in ForgeAI → imports them (clone + index), then offers to clone locally
//  • Repos already in ForgeAI        → clones into VS Code
//  • Local-folder workspaces         → opens the folder directly (nothing to clone)
async function importRepo() {
  try {
    const [forgeRepos, ghRepos] = await Promise.all([
      api.listRepositories(),
      api.listGitHubRepos().catch(() => null), // null → GitHub not connected / endpoint unavailable
    ])

    const importedIds = new Set((forgeRepos ?? []).map((r: any) => r.githubId))
    const items: RepoPick[] = []

    for (const r of ghRepos ?? []) {
      if (importedIds.has(r.id)) continue
      items.push({
        label: `$(repo) ${r.full_name}`,
        description: `${r.language ?? ''} · import into ForgeAI`,
        id: '', github: r,
      })
    }
    for (const r of forgeRepos ?? []) {
      items.push({
        label: `$(check) ${r.fullName}`,
        description: r.source === 'local' ? 'local folder · open in VS Code' : `${r.status} · clone to VS Code`,
        id: r._id, cloneUrl: r.cloneUrl, localPath: r.localPath, source: r.source,
      })
    }

    if (!items.length) {
      vscode.window.showWarningMessage(
        ghRepos === null
          ? 'No repositories found. Sign in to ForgeAI with GitHub (dashboard) so your repos can be listed.'
          : 'No repositories found on your GitHub account.',
      )
      return
    }

    const pick = await vscode.window.showQuickPick<RepoPick>(items, {
      placeHolder: 'Select a repository — new GitHub repos are imported into ForgeAI first',
      matchOnDescription: true,
    })
    if (!pick) return

    // ── New GitHub repo → import into ForgeAI, then offer to clone ──
    if (pick.github) {
      const g = pick.github
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `ForgeAI: Importing ${g.full_name}…`, cancellable: false },
        async (progress) => {
          const repo = await api.importRepository({
            githubId: g.id, fullName: g.full_name, name: g.name, description: g.description,
            language: g.language, private: g.private, defaultBranch: g.default_branch, cloneUrl: g.clone_url,
          })
          progress.report({ message: 'cloning on the ForgeAI server…' })
          let status = repo.status
          const deadline = Date.now() + 2 * 60 * 1000
          while (status !== 'ready' && status !== 'error' && Date.now() < deadline) {
            await sleep(3000)
            try { status = (await api.getRepository(repo._id)).status } catch { break }
            progress.report({ message: status })
          }
          if (status === 'error') {
            vscode.window.showErrorMessage(`Import of ${g.full_name} failed — check the ForgeAI dashboard.`)
            return
          }
          const choice = await vscode.window.showInformationMessage(
            `✅ ${g.full_name} imported into ForgeAI${status === 'ready' ? '' : ' (still indexing)'}.`,
            'Clone to VS Code',
          )
          if (choice) await vscode.commands.executeCommand('git.clone', g.clone_url)
        },
      )
      return
    }

    // ── Local-folder workspace → just open it ──
    if (pick.source === 'local' && pick.localPath) {
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(pick.localPath), { forceNewWindow: true })
      return
    }

    // ── Already-imported GitHub repo → clone locally ──
    if (pick.cloneUrl) await vscode.commands.executeCommand('git.clone', pick.cloneUrl)
  } catch (err: any) {
    if (err.response?.status === 401) {
      const act = await vscode.window.showErrorMessage(
        'ForgeAI: token missing or expired. Log OUT of the web app and log back in (that mints a fresh token), copy it, then run Set Token.',
        'Set Token',
      )
      if (act) vscode.commands.executeCommand('forgeai.setToken')
      return
    }
    vscode.window.showErrorMessage(`ForgeAI: ${err.response?.data?.message ?? err.message}`)
  }
}

// ═══ Existing repo-based commands ══════════════════════════
async function pickRepository(): Promise<string | undefined> {
  try {
    const repos = await api.listRepositories()
    if (!repos.length) {
      vscode.window.showWarningMessage('No repositories found. Import one in the ForgeAI dashboard.')
      return undefined
    }
    const items: RepoPick[] = repos.map((r: any) => ({ label: r.fullName, description: r.status, id: r._id }))
    const pick = await vscode.window.showQuickPick<RepoPick>(items, { placeHolder: 'Select a repository' })
    return pick?.id
  } catch {
    vscode.window.showErrorMessage('Could not fetch repositories. Check your ForgeAI token in settings.')
    return undefined
  }
}

async function fixWorkspace() {
  const repoId = await pickRepository()
  if (!repoId) return
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'ForgeAI: Fixing workspace…', cancellable: false },
    async (progress) => {
      try {
        progress.report({ increment: 10, message: 'Starting task…' })
        const task = await api.fixWorkspace(repoId)
        progress.report({ increment: 40, message: 'AI is analyzing errors…' })
        let done = false
        while (!done) {
          await sleep(3000)
          const updated = await api.getTask(task._id)
          progress.report({ increment: 5, message: `${updated.progress}% complete…` })
          if (updated.status === 'completed' || updated.status === 'failed') {
            done = true
            if (updated.status === 'completed') {
              vscode.window.showInformationMessage(`✅ ForgeAI fixed ${updated.changes?.length ?? 0} file(s).`)
            } else {
              vscode.window.showErrorMessage(`ForgeAI task failed: ${updated.error ?? 'Unknown error'}`)
            }
          }
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`ForgeAI error: ${err.message}`)
      }
    },
  )
}

async function fixCurrentFile() {
  const editor = vscode.window.activeTextEditor
  if (!editor) { vscode.window.showWarningMessage('No active file.'); return }
  const repoId = await pickRepository()
  if (!repoId) return
  const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''
  const filePath = editor.document.uri.fsPath.replace(wsFolder, '').replace(/\\/g, '/').replace(/^\//, '')
  try {
    await api.fixFile(repoId, filePath)
    vscode.window.showInformationMessage(`ForgeAI: Fixing ${filePath}…`)
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed: ${err.message}`)
  }
}

async function explainFile() {
  const editor = vscode.window.activeTextEditor
  if (!editor) { vscode.window.showWarningMessage('No active file.'); return }
  const repoId = await pickRepository()
  if (!repoId) return
  const fileName = editor.document.fileName.split(/[\\/]/).pop()
  try {
    const { response } = await api.chat(repoId, `Explain the purpose and structure of ${fileName}.`)
    showHtmlPanel(`ForgeAI: ${fileName}`, `<h2>${fileName}</h2><div>${markdownToHtml(response)}</div>`)
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed: ${err.message}`)
  }
}

// ═══ Local mode ════════════════════════════════════════════
async function fixLocalFile() {
  const editor = vscode.window.activeTextEditor
  if (!editor) { vscode.window.showWarningMessage('No active file.'); return }
  const fileName = editor.document.fileName.split(/[\\/]/).pop() ?? 'file'
  const code = editor.document.getText()
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `ForgeAI: Fixing ${fileName}…`, cancellable: false },
    async () => {
      try {
        const fixed = await api.fixCode(code, fileName)
        const fullRange = new vscode.Range(editor.document.positionAt(0), editor.document.positionAt(code.length))
        await editor.edit((edit) => edit.replace(fullRange, fixed))
        vscode.window.showInformationMessage(`⚡ Fixed ${fileName} — review and save (Ctrl+Z to undo)`)
      } catch (err: any) {
        vscode.window.showErrorMessage(`ForgeAI: ${err.response?.data?.message ?? err.message}`)
      }
    },
  )
}

async function explainLocalFile() {
  const editor = vscode.window.activeTextEditor
  if (!editor) { vscode.window.showWarningMessage('No active file.'); return }
  const fileName = editor.document.fileName.split(/[\\/]/).pop() ?? 'file'
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `ForgeAI: Reading ${fileName}…`, cancellable: false },
    async () => {
      try {
        const explanation = await api.explainCode(editor.document.getText(), fileName)
        showHtmlPanel(`ForgeAI: ${fileName}`, `<h2>${fileName}</h2><div>${markdownToHtml(explanation)}</div>`)
      } catch (err: any) {
        vscode.window.showErrorMessage(`ForgeAI: ${err.response?.data?.message ?? err.message}`)
      }
    },
  )
}

// ═══ Helpers ═══════════════════════════════════════════════
function openDashboard() {
  const config = vscode.workspace.getConfiguration('forgeai')
  const url = (config.get('apiUrl') as string).replace('/api', '')
  vscode.env.openExternal(vscode.Uri.parse(url))
}

function showHtmlPanel(title: string, body: string) {
  const panel = vscode.window.createWebviewPanel('forgeai.panel', title, vscode.ViewColumn.Beside, {})
  panel.webview.html = `<!DOCTYPE html><html><head><style>
    body{font-family:system-ui;padding:20px;line-height:1.6;color:#e4e4e7;background:#18181b;}
    pre{background:#27272a;padding:12px;border-radius:8px;overflow:auto;}code{color:#a5b4fc;}
  </style></head><body>${body}</body></html>`
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

/** Expiry time (ms since epoch) from a JWT, or null if unparsable */
function jwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf-8'))
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

function markdownToHtml(md: string): string {
  return md
    .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
}

export function deactivate() {}
