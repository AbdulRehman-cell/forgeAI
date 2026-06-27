import axios, { AxiosInstance } from 'axios'

export class ForgeAIApi {
  private client: AxiosInstance

  constructor(baseURL: string, token: string) {
    this.client = axios.create({ baseURL, timeout: 30_000 })
    if (token) this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`
  }

  updateConfig(baseURL: string, token: string) {
    this.client.defaults.baseURL = baseURL
    this.client.defaults.headers.common['Authorization'] = token ? `Bearer ${token}` : ''
  }

  async listRepositories() {
    const { data } = await this.client.get('/repositories')
    return data.repositories
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

  async chat(repositoryId: string, message: string) {
    const { data } = await this.client.post('/ai/chat', { repositoryId, message })
    return data
  }
}
