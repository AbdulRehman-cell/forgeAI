// backend/src/middleware/usage.middleware.ts
import { Request, Response, NextFunction } from 'express'
import { User, nextMonthStart } from '../modules/users/user.model'
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

    user.usage[kind] += 1
    await user.save()
    next()
  }
}
