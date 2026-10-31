// After a build or a change, a conversation's site is published to a private preview
// address on Cloudflare R2 (blitzDeploy's `preview` mode), so showing it costs the
// ForgeAI server nothing and a restart cannot break it.

import { enqueueJob } from '../../lib/workers'
import { Repository } from '../repository/repository.model'
import { Task } from '../tasks/task.model'
import { Conversation } from './conversation.model'

/** Starts a preview for this repository's site, if it belongs to a home page conversation */
export async function queuePreview(repositoryId: string, userId: string) {
  if (!(await Conversation.exists({ repositoryId }))) return null
  const repo = await Repository.findById(repositoryId).select('+builderEnv')
  if (!repo?.localPath) return null
  const task = await Task.create({ userId, repositoryId, type: 'blitz_deploy', status: 'pending', metadata: { preview: true } })
  const builderEnv = (repo as any).builderEnv ?? {}
  await enqueueJob('blitz-deploy', {
    taskId: task._id.toString(),
    repositoryId,
    userId,
    localPath: repo.localPath,
    platform: 'self-hosted',
    repoFullName: /^[^/]+\/[^/]+$/.test(repo.fullName) ? repo.fullName : undefined,
    repoName: repo.name,
    isLocal: false,
    needsGitHubPush: false,
    type: 'blitz_deploy',
    envVars: Object.keys(builderEnv).length ? builderEnv : undefined,
    preview: true,
  })
  return task
}
