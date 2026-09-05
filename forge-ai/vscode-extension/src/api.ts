import axios, { AxiosInstance } from 'axios'
import * as vscode from 'vscode'

/** Strip accidental quotes/whitespace that break the Bearer header */
function cleanToken(t: string): string {
  return (t ?? '').trim().replace(/^["']|["']$/g, '')
}

export class ForgeAIApi {
  private client: AxiosInstance

  constructor(_baseURL?: string, _token?: string) {
    // Base URL and token are resolved fresh per-request from settings,
    // so constructor args are optional and only kept for back-compat.
    this.client = axios.create({ timeout: 60_000 })

    // Read settings on EVERY request — immune to activation-order issues
    this.client.interceptors.request.use((config) => {
      const cfg = vscode.workspace.getConfiguration('forgeai')
      const baseURL = (cfg.get<string>('apiUrl') ?? 'http://localhost:4000/api').replace(/\/$/, '')
      const token = cleanToken(cfg.get<string>('token') ?? '')

      config.baseURL = baseURL
      if (token) {
        config.headers = config.headers ?? {}
        config.headers['Authorization'] = `Bearer ${token}`
      }
      console.log('[forgeai] →', config.method?.toUpperCase(), config.url,
        'token:', token ? `${token.slice(0, 12)}… (len ${token.length})` : 'NONE')
      return config
    })
  }
  async analyzeFolder(
    files: { path: string; content: string }[],
    diagnostics: string[],
  ): Promise<{ summary: string; issues: any[] }> {
    const { data } = await this.client.post('/ai/analyze-folder', { files, diagnostics })
    return data
  }

  async fixFiles(
    files: { path: string; content: string }[],
    issues: string,
  ): Promise<{ fixes: { path: string; content: string }[] }> {
    const { data } = await this.client.post('/ai/fix-files', { files, issues })
    return data
  }
  /** Kept for back-compat with the config-change listener; now a no-op
      since every request reads live settings anyway. */
  updateConfig(_baseURL: string, _token: string) {}


  async fixFileDeep(
    file: { path: string; content: string },
    folderContext: string,
    findings: string,
    diagnostics: string,
  ): Promise<{ changed: boolean; content?: string }> {
    const { data } = await this.client.post('/ai/fix-file-deep', { file, folderContext, findings, diagnostics })
    return data
  }

  // ── Repo-based (requires imported GitHub repo) ──────────
  async listRepositories() {
    const { data } = await this.client.get('/repositories')
    return data.repositories
  }

  /** GitHub repos of the connected account (not yet necessarily imported) */
  async listGitHubRepos() {
    const { data } = await this.client.get('/github/repos')
    return data.repositories
  }

  /** Import a GitHub repo into ForgeAI (starts the clone+index pipeline) */
  async importRepository(payload: {
    githubId: number; fullName: string; name: string; description?: string
    language?: string; private: boolean; defaultBranch: string; cloneUrl: string
  }) {
    const { data } = await this.client.post('/repositories/import', payload)
    return data.repository
  }

  async getRepository(id: string) {
    const { data } = await this.client.get(`/repositories/${id}`)
    return data.repository
  }

  /** Exchange a valid (short-lived) token for a 90-day extension token */
  async getExtensionToken(shortToken: string): Promise<string> {
    const cfg = vscode.workspace.getConfiguration('forgeai')
    const baseURL = (cfg.get<string>('apiUrl') ?? 'http://localhost:4000/api').replace(/\/$/, '')
    const { data } = await axios.get(`${baseURL}/auth/extension-token`, {
      headers: { Authorization: `Bearer ${cleanToken(shortToken)}` },
      timeout: 15_000,
    })
    return data.token
  }

  async fixWorkspace(repositoryId: string) {
    const { data } = await this.client.post('/tasks/fix-workspace', { repositoryId })
    return data.task
  }

  async fixFile(repositoryId: string, filePath: string) {
    const { data } = await this.client.post('/tasks/fix-file', { repositoryId, filePath })
    return data.task
  }

  async getTask(taskId: string) {
    const { data } = await this.client.get(`/tasks/${taskId}`)
    return data.task
  }

  async listTasks(limit = 20) {
    const { data } = await this.client.get(`/tasks?limit=${limit}`)
    return data.tasks
  }

  async chat(repositoryId: string, message: string) {
    const { data } = await this.client.post('/ai/chat', { repositoryId, message })
    return data
  }

  // ── Local mode (works on ANY file, no repo needed) ──────
  async fixCode(code: string, fileName: string): Promise<string> {
    const { data } = await this.client.post('/ai/fix-code', { code, fileName })
    return data.fixed
  }

  async explainCode(code: string, fileName: string): Promise<string> {
    const { data } = await this.client.post('/ai/explain-code', { code, fileName })
    return data.explanation
  }
  
}