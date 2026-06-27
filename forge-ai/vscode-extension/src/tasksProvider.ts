import * as vscode from 'vscode'
import { ForgeAIApi } from './api'

export class TasksProvider implements vscode.TreeDataProvider<TaskItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TaskItem | undefined>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  constructor(private api: ForgeAIApi) {
    // Auto-refresh every 10s
    setInterval(() => this.refresh(), 10_000)
  }

  refresh() {
    this._onDidChangeTreeData.fire(undefined)
  }

  getTreeItem(element: TaskItem): vscode.TreeItem {
    return element
  }

  async getChildren(): Promise<TaskItem[]> {
    try {
      const tasks = await this.api['client'].get('/tasks?limit=20').then((r: any) => r.data.tasks)
      return tasks.map((t: any) => new TaskItem(t))
    } catch {
      return [new TaskItem({ type: 'error', status: 'failed', _id: '0', createdAt: new Date().toISOString() })]
    }
  }
}

class TaskItem extends vscode.TreeItem {
  constructor(task: any) {
    const label = task.type === 'error'
      ? 'Could not connect to ForgeAI'
      : `${task.type.replace(/_/g, ' ')} — ${task.status}`

    super(label, vscode.TreeItemCollapsibleState.None)

    const iconMap: Record<string, string> = {
      completed: 'check',
      failed: 'error',
      running: 'sync~spin',
      pending: 'clock',
    }
    this.iconPath = new vscode.ThemeIcon(iconMap[task.status] ?? 'circle-outline')
    this.description = task.createdAt ? new Date(task.createdAt).toLocaleString() : ''
    this.tooltip = task.summary ?? task.error ?? task.status
  }
}
