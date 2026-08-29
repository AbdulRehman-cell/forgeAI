import cron from 'node-cron'
import { Repository } from '../modules/repository/repository.model'
import { Task } from '../modules/tasks/task.model'
import { enqueueJob } from './workers'

// Runs every day at 03:00 UTC — checks for repos whose maintenance plan nextRunAt is due
export function startMaintenancePlanScheduler() {
  cron.schedule('0 3 * * *', async () => {
    const now = new Date()
    try {
      const repos = await Repository.find({
        'maintenancePlan.active': true,
        'maintenancePlan.nextRunAt': { $lte: now },
      })

      for (const repo of repos) {
        const importUrl = (repo as any).metadata?.importUrl || undefined
        if (!repo.localPath || !importUrl) continue

        const task = await Task.create({
          userId: repo.userId,
          repositoryId: repo._id,
          type: 'build_site',
          status: 'pending',
          metadata: { prompt: 'Monthly maintenance: refresh content, photos, and polish.', importUrl, mode: 'enhance', maintenanceRun: true },
        })

        await enqueueJob('build-site', {
          taskId: task._id.toString(),
          repositoryId: repo._id.toString(),
          userId: repo.userId.toString(),
          prompt: 'Monthly maintenance: refresh all content, update photos, polish CSS.',
          siteName: repo.name,
          stack: 'static',
          style: 'auto',
          importUrl,
          mode: 'enhance',
          aiProvider: 'github',
          type: 'build_site',
        })

        // Schedule next run 30 days from now
        const nextRun = new Date(now)
        nextRun.setDate(nextRun.getDate() + 30)
        repo.maintenancePlan!.lastRunAt = now
        repo.maintenancePlan!.nextRunAt = nextRun
        await repo.save()

        console.log(`[maintenance-plan] Triggered monthly refresh for repo ${repo.name}`)
      }
    } catch (err) {
      console.error('[maintenance-plan] Scheduler error:', err)
    }
  })

  console.log('[maintenance-plan] Scheduler started (daily at 03:00 UTC)')
}
