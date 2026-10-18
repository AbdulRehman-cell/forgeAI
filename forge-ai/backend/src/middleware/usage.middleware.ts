// backend/src/middleware/usage.middleware.ts
import { Request, Response, NextFunction } from 'express'
import { User, nextMonthStart } from '../modules/users/user.model'
import { Task } from '../modules/tasks/task.model'
import { PLANS, UsageKind } from '../lib/plans'

/**
 * Quota middleware factory.
 * Usage: router.post('/fix-workspace', checkQuota('fixes'), handler)
 * NOTE: must run AFTER requireAuth. Increments the counter after the check passes.
 */
export function checkQuota(kind: UsageKind) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authedUser = req.user as any
    const user = await User.findById(authedUser._id)
    if (!user) return res.status(401).json({ message: 'Unauthorized' })

    // Monthly reset
    if (new Date() > user.usage.resetAt) {
      user.usage.fixes = 0
      user.usage.chats = 0
      user.usage.reviews = 0
      user.usage.deploys = 0
      user.usage.builds = 0
      user.usage.resetAt = nextMonthStart()
      await user.save()
    }

    const limit = PLANS[user.plan].limits[kind]
    if (user.usage[kind] >= limit) {
      return res.status(402).json({
        message: `You've reached your ${PLANS[user.plan].name} plan limit for ${kind} this month. Upgrade to continue.`,
        code: 'QUOTA_EXCEEDED',
        kind,
        used: user.usage[kind],
        limit: limit === Infinity ? 'unlimited' : limit,
        plan: user.plan,
      })
    }

    // Team per-member budget cap — only applies to team members (not the owner)
    if (user.teamOwnerId) {
      const owner = await User.findById(user.teamOwnerId)
      if (owner) {
        const memberRecord = (owner.teamMembers ?? []).find(
          (m: any) => m.userId?.toString() === user._id.toString(),
        )
        const cap: number | null | undefined = memberRecord?.monthlyTaskLimit
        if (cap != null) {
          const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          const usedThisMonth = await Task.countDocuments({ userId: user._id, createdAt: { $gte: monthStart } })
          if (usedThisMonth >= cap) {
            return res.status(402).json({
              message: `Team budget reached — your owner has set a limit of ${cap} AI tasks per month. Contact them to increase it.`,
              code: 'TEAM_BUDGET_EXCEEDED',
              used: usedThisMonth,
              limit: cap,
            })
          }
        }
      }
    }

    user.usage[kind] += 1
    await user.save()
    next()
  }
}
