import { Router } from 'express'
import fs from 'fs'
import { requireAuth } from '../../middleware/auth.middleware'
import { Deployment } from './deployment.model'
import { deleteFromR2 } from '../../lib/selfHostedDeploy'

const router = Router()
router.use(requireAuth)

// List all deployments for the current user
router.get('/', async (req, res) => {
  const user = req.user as any
  const deployments = await Deployment.find({ userId: user._id }).sort({ createdAt: -1 }).lean()
  res.json({ deployments })
})

// Delete a deployment — removes files from R2 (or local disk) + DB record
router.delete('/:slug', async (req, res) => {
  const user = req.user as any
  const deployment = await Deployment.findOne({ slug: req.params.slug, userId: user._id })
  if (!deployment) return res.status(404).json({ message: 'Deployment not found' })

  const r2Active = !!(
    process.env.CLOUDFLARE_R2_ACCOUNT_ID &&
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
    process.env.CLOUDFLARE_R2_BUCKET
  )

  if (r2Active) {
    await deleteFromR2(deployment.slug).catch(() => {})
  } else if (deployment.siteDir && fs.existsSync(deployment.siteDir)) {
    fs.rmSync(deployment.siteDir, { recursive: true, force: true })
  }

  await deployment.deleteOne()
  res.json({ message: 'Deleted' })
})

export default router
