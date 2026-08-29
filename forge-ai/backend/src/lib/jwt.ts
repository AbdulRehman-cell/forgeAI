import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET ?? 'dev_secret'
const EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d'

export function signToken(userId: string, expiresIn: string = EXPIRES_IN): string {
  return jwt.sign({ sub: userId }, SECRET, { expiresIn } as jwt.SignOptions)
}

export function verifyToken(token: string): { sub: string } {
  return jwt.verify(token, SECRET) as { sub: string }
}
