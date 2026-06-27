import * as vscode from 'vscode'
import { ForgeAIApi } from './api'
import { TasksProvider } from './tasksProvider'

let api: ForgeAIApi

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('forgeai')
  api = new ForgeAIApi(
    config.get('apiUrl') ?? 'http://localhost:4000/api',
    config.get('token') ?? '',
  )

  // Register task tree view
  const tasksProvider = new TasksProvider(api)
  vscode.window.registerTreeDataProvider('forgeai.tasks', tasksProvider)

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('forgeai.fixWorkspace', () => fixWorkspace()),
    vscode.commands.registerCommand('forgeai.fixCurrentFile', () => fixCurrentFile()),
    vscode.commands.registerCommand('forgeai.explainFile', () => explainFile()),
    vscode.commands.registerCommand('forgeai.openDashboard', () => openDashboard()),
  )

  // Config change listener
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('forgeai')) {
      const updated = vscode.workspace.getConfiguration('forgeai')
      api.updateConfig(
        updated.get('apiUrl') ?? 'http://localhost:4000/api',
        updated.get('token') ?? '',
      )
    }
  })

  vscode.window.showInformationMessage('ForgeAI is active.')
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

        // Poll until done
        let done = false
        while (!done) {
          await sleep(3000)
          const updated = await api.getTask(task._id)
          progress.report({ increment: 5, message: `${updated.progress}% complete…` })
          if (updated.status === 'completed' || updated.status === 'failed') {
            done = true
            if (updated.status === 'completed') {
              vscode.window.showInformationMessage(
                `✅ ForgeAI fixed ${updated.changes?.length ?? 0} file(s). ${updated.summary ?? ''}`,
              )
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
  if (!editor) {
    vscode.window.showWarningMessage('No active file.')
    return
  }

  const repoId = await pickRepository()
  if (!repoId) return

  const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''
  const filePath = editor.document.uri.fsPath.replace(wsFolder + '/', '')

  try {
    await api.fixFile(repoId, filePath)
    vscode.window.showInformationMessage(`ForgeAI: Fixing ${filePath}…`)
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed: ${err.message}`)
  }
}

async function explainFile() {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    vscode.window.showWarningMessage('No active file.')
    return
  }

  const repoId = await pickRepository()
  if (!repoId) return

  const fileName = editor.document.fileName.split('/').pop()

  try {
    const { response } = await api.chat(repoId, `Explain the purpose and structure of ${fileName}. What does it do? What are the key functions?`)

    const panel = vscode.window.createWebviewPanel(
      'forgeai.explain',
      `ForgeAI: ${fileName}`,
      vscode.ViewColumn.Beside,
      {},
    )
    panel.webview.html = `<!DOCTYPE html>
<html>
<head><style>body{font-family:system-ui;padding:20px;line-height:1.6;color:#e4e4e7;background:#18181b;}pre{background:#27272a;padding:12px;border-radius:8px;overflow:auto;}</style></head>
<body><h2>${fileName}</h2><div>${markdownToHtml(response)}</div></body>
</html>`
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed: ${err.message}`)
  }
}

function openDashboard() {
  const config = vscode.workspace.getConfiguration('forgeai')
  const url = (config.get('apiUrl') as string).replace('/api', '')
  vscode.env.openExternal(vscode.Uri.parse(url))
}

async function pickRepository(): Promise<string | undefined> {
  try {
    const repos = await api.listRepositories()
    if (!repos.length) {
      vscode.window.showWarningMessage('No repositories found. Import one in the ForgeAI dashboard.')
      return undefined
    }
    const pick = await vscode.window.showQuickPick(
      repos.map((r: any) => ({ label: r.fullName, description: r.status, id: r._id })),
      { placeHolder: 'Select a repository' },
    )
    return pick?.id
  } catch {
    vscode.window.showErrorMessage('Could not fetch repositories. Check your ForgeAI token in settings.')
    return undefined
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function markdownToHtml(md: string): string {
  return md
    .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
}

export function deactivate() {}
