import { Request, Response, NextFunction } from 'express'
import passport from 'passport'

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  passport.authenticate('jwt', { session: false }, (err: any, user: any, info: any) => {
    if (err || !user) {
      console.log('[auth] REJECTED', req.method, req.path,
        '| reason:', info?.message ?? info ?? err?.message ?? 'unknown',
        '| header:', req.headers.authorization?.slice(0, 30) ?? 'MISSING')
      return res.status(401).json({ message: 'Unauthorized' })
    }
    console.log('[auth] ACCEPTED', req.method, req.path,
        '| reason:', info?.message ?? info ?? err?.message ?? 'unknown',
        '| header:', req.headers.authorization?.slice(0, 30) ?? 'MISSING')
    req.user = user
    next()
  })(req, res, next)
}