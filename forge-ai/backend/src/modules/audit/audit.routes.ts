import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { auditSite } from '../../lib/siteAudit'

const router = Router()

// Simple in-memory cache: url → { result, ts }
const cache = new Map<string, { result: any; ts: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many audits from this IP. Try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
})

function normalizeUrl(raw: string): string {
  raw = raw.trim()
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`
  try { return new URL(raw).href } catch { return raw }
}

router.post('/', limiter, async (req, res) => {
  const { url } = req.body
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' })
  }

  const normalized = normalizeUrl(url)

  // Validate URL shape
  try { new URL(normalized) } catch {
    return res.status(400).json({ error: 'That doesn\'t look like a valid URL' })
  }

  // Serve from cache if fresh
  const cached = cache.get(normalized)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return res.json({ ...cached.result, cached: true })
  }

  try {
    const result = await auditSite(normalized)
    if (!result) {
      return res.status(422).json({ error: 'Could not reach that website. Check the URL and try again.' })
    }
    cache.set(normalized, { result, ts: Date.now() })
    // Prune old cache entries
    if (cache.size > 500) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0]
      cache.delete(oldest[0])
    }
    res.json(result)
  } catch (err: any) {
    console.error('[audit] Error:', err?.message)
    res.status(500).json({ error: 'Audit failed. The site may be blocking our scanner.' })
  }
})

export default router
