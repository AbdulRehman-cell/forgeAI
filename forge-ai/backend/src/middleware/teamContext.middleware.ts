import { Request, Response, NextFunction } from 'express'
import { Repository } from '../modules/repository/repository.model'

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

/**
 * Guards a route that has `:id` or `:repoId` as the repository param.
 * Team members with restricted access (allowedMemberIds set on the repo)
 * are blocked unless their userId appears in that list.
 */
export async function checkRepoAccess(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any
  if (!user?.teamOwnerId) return next() // owner or non-team user — always allowed

  const repoId = req.params.id ?? req.params.repoId
  if (!repoId) return next()

  const repo = await Repository.findById(repoId).select('allowedMemberIds')
  if (!repo) return next() // will 404 elsewhere

  const allowed = repo.allowedMemberIds ?? []
  if (allowed.length === 0) return next() // empty = all members allowed

  const hasAccess = allowed.some((id: any) => id.toString() === user._id.toString())
  if (!hasAccess) return res.status(403).json({ message: 'You do not have access to this repository' })

  next()
}
