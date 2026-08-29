// vscode-extension/src/inlineFeatures.ts — NEW FILE
// Adds the "cool" layer to the extension:
//   1. ⚡ Status bar item showing ForgeAI + live task state
//   2. Right-click → "ForgeAI: Explain Selection" (webview answer)
//   3. Right-click → "ForgeAI: Fix Selection" (replaces code in place)
//   4. CodeLens "⚡ Fix with ForgeAI" above functions with TODO/FIXME
//
// Wire-up in extension.ts activate():
//   import { registerInlineFeatures } from './inlineFeatures'
//   registerInlineFeatures(context, api, pickRepository)
//
// And add to package.json "contributes.commands":
//   { "command": "forgeai.explainSelection", "title": "ForgeAI: Explain Selection" },
//   { "command": "forgeai.fixSelection", "title": "ForgeAI: Fix Selection" }
// And "contributes.menus":
//   "editor/context": [
//     { "command": "forgeai.explainSelection", "when": "editorHasSelection", "group": "forgeai" },
//     { "command": "forgeai.fixSelection", "when": "editorHasSelection", "group": "forgeai" }
//   ]

import * as vscode from 'vscode'
import { ForgeAIApi } from './api'

export function registerInlineFeatures(
  context: vscode.ExtensionContext,
  api: ForgeAIApi,
  pickRepository: () => Promise<string | undefined>,
) {
  // ── 1. Status bar ──
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  statusBar.text = '$(zap) ForgeAI'
  statusBar.tooltip = 'ForgeAI — click for AI actions'
  statusBar.command = 'forgeai.fixWorkspace'
  statusBar.show()
  context.subscriptions.push(statusBar)

  // ── 2. Explain Selection ──
  context.subscriptions.push(
    vscode.commands.registerCommand('forgeai.explainSelection', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showWarningMessage('Select some code first.')
        return
      }
      const repoId = await pickRepository()
      if (!repoId) return

      const code = editor.document.getText(editor.selection)
      statusBar.text = '$(sync~spin) ForgeAI thinking…'

      try {
        const { response } = await api.chat(
          repoId,
          `Explain this code snippet from ${editor.document.fileName.split(/[\\/]/).pop()} clearly and concisely. What does it do, and are there any issues?\n\n\`\`\`\n${code}\n\`\`\``,
        )
        const panel = vscode.window.createWebviewPanel(
          'forgeai.explain', '⚡ ForgeAI Explanation', vscode.ViewColumn.Beside, {},
        )
        panel.webview.html = wrapHtml(response)
      } catch (e: any) {
        vscode.window.showErrorMessage(`ForgeAI: ${e.message}`)
      } finally {
        statusBar.text = '$(zap) ForgeAI'
      }
    }),
  )

  // ── 3. Fix Selection (in-place replace) ──
  context.subscriptions.push(
    vscode.commands.registerCommand('forgeai.fixSelection', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showWarningMessage('Select the code to fix first.')
        return
      }
      const repoId = await pickRepository()
      if (!repoId) return

      const code = editor.document.getText(editor.selection)
      statusBar.text = '$(sync~spin) ForgeAI fixing…'

      try {
        const { response } = await api.chat(
          repoId,
          `Fix all bugs and quality issues in this snippet. Return ONLY the fixed code inside a single code block, no explanation:\n\n\`\`\`\n${code}\n\`\`\``,
        )
        const match = response.match(/```(?:\w+)?\n([\s\S]+?)\n```/)
        const fixed = match ? match[1] : response

        await editor.edit((edit) => edit.replace(editor.selection, fixed))
        vscode.window.showInformationMessage('⚡ ForgeAI fixed your selection')
      } catch (e: any) {
        vscode.window.showErrorMessage(`ForgeAI: ${e.message}`)
      } finally {
        statusBar.text = '$(zap) ForgeAI'
      }
    }),
  )

  // ── 4. CodeLens on TODO / FIXME ──
  const lensProvider: vscode.CodeLensProvider = {
    provideCodeLenses(doc) {
      const lenses: vscode.CodeLens[] = []
      for (let i = 0; i < doc.lineCount; i++) {
        const line = doc.lineAt(i)
        if (/\b(TODO|FIXME|HACK|XXX)\b/.test(line.text)) {
          lenses.push(new vscode.CodeLens(line.range, {
            title: '⚡ Fix with ForgeAI',
            command: 'forgeai.fixCurrentFile',
          }))
        }
      }
      return lenses
    },
  }
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, lensProvider),
  )
}

function wrapHtml(md: string): string {
  const body = md
    .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\n/g, '<br>')
  return `<!DOCTYPE html><html><head><style>
    body{font-family:system-ui;padding:24px;line-height:1.7;color:#e4e4e7;background:#131318;font-size:13px}
    pre{background:#1c1c22;border:1px solid #2a2a34;padding:14px;border-radius:10px;overflow:auto}
    code{color:#a5b4fc;font-family:'JetBrains Mono',monospace;font-size:12px}
    h2,h3{color:#f4f4f5}
  </style></head><body>${body}</body></html>`
}
