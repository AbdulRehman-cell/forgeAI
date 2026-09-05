import { Request, Response, NextFunction } from 'express'

/**
 * After requireAuth, inject req.effectiveUserId.
 * When the logged-in user is an accepted team member, their requests
 * act on behalf of the team owner for resource routes (repos, tasks, etc.).
 */
export function resolveTeamOwner(req: Request, _res: Response, next: NextFunction) {
  const user = req.user as any
  if (user?.teamOwnerId) {
    ;(req as any).effectiveUserId = user.teamOwnerId
  } else {
    ;(req as any).effectiveUserId = user?._id
  }
  next()
}

export function getEffectiveUserId(req: Request): any {
  return (req as any).effectiveUserId ?? (req.user as any)?._id
}
