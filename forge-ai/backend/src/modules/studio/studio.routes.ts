// ─── Home page conversations ─────────────────────────────────────────────────
// Everything a build thread does before the client presses Build runs on ForgeAI's
// own code (lib/studio.ts) with no AI calls. Chat threads answer with the same
// assistant as /ai/general-chat.

import path from 'path'
import fs from 'fs'
import { gzip } from 'zlib'
import { promisify } from 'util'
import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import { resolveTeamOwner, getEffectiveUserId } from '../../middleware/teamContext.middleware'
import { Repository } from '../repository/repository.model'
import { Task } from '../tasks/task.model'
import { generalChatReply } from '../ai/ai.routes'
import { fetchImagePool } from '../tasks/task.processor'
import { Conversation, IConversation } from './conversation.model'
import { designOptions, displayName, includeQuestion, questionsFor, renderPreviewBundle, type Question } from '../../lib/studio'
import { queuePreview } from './preview.queue'

const router = Router()
const gzipped = promisify(gzip)

// ── The built site, before it is deployed ──
// Public by its unguessable token. The sandbox header gives every page a throwaway
// origin even when opened directly, so a generated page can never act as this API.
router.get('/site/:token/*', async (req, res) => {
  const repo = await Repository.findOne({ shareToken: req.params.token }).select('localPath')
  if (!repo?.localPath) return res.status(404).send('This preview is not available.')
  const file = String((req.params as any)[0] || 'index.html')
  const abs = path.resolve(repo.localPath, file)
  if (!abs.startsWith(path.resolve(repo.localPath) + path.sep) || /(^|[\\/])\.[^\\/]/.test(file) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return res.status(404).send('Not found')
  }
  res.removeHeader('X-Frame-Options')
  res.setHeader('Content-Security-Policy', "sandbox allow-scripts allow-forms allow-popups; default-src * 'unsafe-inline' data: blob:")
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  res.sendFile(abs)
})

router.use(requireAuth, resolveTeamOwner)

const say = (conv: IConversation, content: string, kind?: string, data?: any) => {
  conv.messages.push({ role: 'assistant', content, kind, data, at: new Date() })
}

const firstPrompt = (conv: IConversation) => conv.messages.find((m) => m.role === 'user')?.content ?? ''

const owned = (req: any) => Conversation.findOne({ _id: req.params.id, userId: getEffectiveUserId(req) })

/** Moves a build thread on: the next question, or the design choice when none are left */
async function advance(conv: IConversation): Promise<void> {
  const prompt = firstPrompt(conv)
  const queue: Question[] = [...questionsFor(prompt), includeQuestion(prompt, conv.answers)]
  const next = queue.find((q) => !(q.id in conv.answers))
  if (next) { say(conv, next.text, 'question', next); return }
  conv.stage = 'design'
  // Real topical photos make the choice feel real, but never hold it up
  const photos = await Promise.race([
    fetchImagePool([prompt.split(/[.,\n]/)[0].slice(0, 60)]).catch(() => [] as string[]),
    new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 8000)),
  ])
  if (photos.length >= 3) conv.photos = photos.slice(0, 8)
  say(conv, `Here is ${displayName(prompt, conv.answers) || 'your site'}. Try the home page and colour options, and watch the preview change. A logo is optional. When it looks right, press Build. The words and photos are samples for now: the real ones are chosen during the build.`, 'design', designOptions(prompt, conv.answers))
}

const withStatus = async (conv: IConversation) => {
  const plain = conv.toObject() as any
  const repoId = conv.repositoryId
  if (!repoId) return { ...plain, tasks: [] }
  const repo = await Repository.findById(repoId).select('shareToken status name previewUrl')
  const tasks = await Task.find({ repositoryId: repoId }).sort({ createdAt: 1 }).limit(30).select('type status progress summary error metadata.deploymentUrl metadata.preview logs createdAt updatedAt').lean()
  const light = tasks.map((t: any) => ({ _id: t._id, type: t.type, status: t.status, progress: t.progress, summary: t.summary, error: t.error, deploymentUrl: t.metadata?.deploymentUrl, preview: !!t.metadata?.preview, lastLog: t.logs?.[t.logs.length - 1]?.message, createdAt: t.createdAt }))
  const built = light.some((t) => t.type === 'build_site' && t.status === 'completed')
  // The server's own copy only fills the moment before the Cloudflare preview is ready
  const onDisk = repo && built && conv.stack === 'static' && !repo.previewUrl ? `/studio/site/${repo.shareToken}/index.html` : ''
  return { ...plain, tasks: light, repository: repo ? { _id: repo._id, name: repo.name, status: repo.status } : null, previewPath: onDisk, previewUrl: repo?.previewUrl ?? '' }
}

router.get('/conversations', async (req, res) => {
  const list = await Conversation.find({ userId: getEffectiveUserId(req) }).sort({ updatedAt: -1 }).limit(60).select('title mode updatedAt').lean()
  res.json({ conversations: list })
})

router.post('/conversations', async (req, res) => {
  const message = String(req.body?.message ?? '').trim().slice(0, 6000)
  if (!message) return res.status(400).json({ message: 'Tell me what you need first' })
  const mode = req.body?.mode === 'chat' ? 'chat' : 'build'
  const conv = new Conversation({
    userId: getEffectiveUserId(req), mode,
    title: message.replace(/\s+/g, ' ').slice(0, 60),
    stack: req.body?.stack === 'supabase' ? 'supabase' : 'static',
    messages: [{ role: 'user', content: message, at: new Date() }],
  })
  if (mode === 'build') await advance(conv)
  await conv.save()
  res.status(201).json({ conversation: await withStatus(conv) })
})

router.get('/conversations/:id', async (req, res) => {
  const conv = await owned(req)
  if (!conv) return res.status(404).json({ message: 'Conversation not found' })
  res.json({ conversation: await withStatus(conv) })
})

router.delete('/conversations/:id', async (req, res) => {
  await Conversation.deleteOne({ _id: req.params.id, userId: getEffectiveUserId(req) })
  res.json({ success: true })
})

// Answers one of the clickable questions
router.post('/conversations/:id/answer', async (req, res) => {
  const conv = await owned(req)
  if (!conv) return res.status(404).json({ message: 'Conversation not found' })
  const pending = [...conv.messages].reverse().find((m) => m.kind === 'question')?.data as Question | undefined
  const id = String(req.body?.id ?? '')
  if (conv.stage !== 'questions' || !pending || pending.id !== id) return res.status(409).json({ message: 'That question has already been answered' })
  const value = req.body?.value
  const clean = Array.isArray(value) ? value.map((v) => String(v).slice(0, 80)).slice(0, 12) : String(value ?? '').trim().slice(0, 200)
  conv.answers = { ...conv.answers, [id]: clean }
  conv.markModified('answers')
  const label = String(req.body?.label ?? '').trim().slice(0, 300) || (Array.isArray(clean) ? clean.join(', ') : clean) || 'Skip'
  conv.messages.push({ role: 'user', content: label, at: new Date() })
  await advance(conv)
  await conv.save()
  res.json({ conversation: await withStatus(conv) })
})

// A typed message: an answer, an extra request for the build, or a chat turn
router.post('/conversations/:id/messages', async (req, res) => {
  const conv = await owned(req)
  if (!conv) return res.status(404).json({ message: 'Conversation not found' })
  const content = String(req.body?.content ?? '').trim().slice(0, 6000)
  if (!content) return res.status(400).json({ message: 'Message is empty' })
  conv.messages.push({ role: 'user', content, at: new Date() })
  if (conv.mode === 'build') {
    if (conv.stage === 'questions') {
      const pending = [...conv.messages].reverse().find((m) => m.kind === 'question')?.data as Question | undefined
      if (pending) {
        conv.answers = { ...conv.answers, [pending.id]: pending.type === 'multi' ? [content] : content }
        conv.markModified('answers')
      }
      await advance(conv)
    } else if (conv.stage === 'design') {
      conv.notes.push(content)
      say(conv, 'Noted. That goes into the build when you press Build.')
    }
    // Once built, the page sends the change through /tasks/patch-site
    await conv.save()
    return res.json({ conversation: await withStatus(conv) })
  }
  await conv.save()
  res.json({ conversation: await withStatus(conv) })
})

// Chat threads: the assistant answers the last message
router.post('/conversations/:id/reply', async (req, res) => {
  const conv = await owned(req)
  if (!conv || conv.mode !== 'chat') return res.status(404).json({ message: 'Conversation not found' })
  const last = conv.messages[conv.messages.length - 1]
  if (last?.role !== 'user') return res.json({ conversation: await withStatus(conv) })
  const history = conv.messages.slice(0, -1).slice(-12).filter((m) => m.content).map((m) => ({ role: m.role, content: m.content }))
  try {
    const { response, followups } = await generalChatReply(last.content, history)
    say(conv, response, 'reply', { followups })
  } catch (err: any) {
    console.error('[studio/reply]', err.message)
    return res.status(502).json({ message: 'The assistant could not answer just now. Please try again.' })
  }
  await conv.save()
  res.json({ conversation: await withStatus(conv) })
})

// The client's current design choices
router.patch('/conversations/:id/design', async (req, res) => {
  const { hero, color, logo } = req.body ?? {}
  // Each choice is written on its own: two quick clicks must not overwrite each other
  const set: Record<string, any> = {}
  const unset: Record<string, any> = {}
  if (typeof hero === 'string') set['design.hero'] = hero.slice(0, 30)
  if (typeof color === 'number') set['design.color'] = Math.max(0, Math.min(5, Math.floor(color)))
  if (logo === null) unset['design.logo'] = 1
  else if (typeof logo === 'string') {
    // Stored with the conversation until the build writes it into the site. No SVG: hosted
    // sites share one origin, and an SVG file opened directly can run scripts on it
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo)) return res.status(400).json({ message: 'The logo must be a PNG, JPG or WebP image' })
    if (logo.length > 1_500_000) return res.status(413).json({ message: 'That logo is too large: please use one under 1 MB' })
    set['design.logo'] = logo
  }
  const conv = await Conversation.findOneAndUpdate(
    { _id: req.params.id, userId: getEffectiveUserId(req) },
    { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) },
    { new: true },
  )
  if (!conv) return res.status(404).json({ message: 'Conversation not found' })
  res.json({ conversation: await withStatus(conv) })
})

// Everything the preview needs for every choice, once. Uses no AI; the browser swaps
// colours, home pages and the logo by itself after this.
router.post('/conversations/:id/preview', async (req, res) => {
  const conv = await owned(req)
  if (!conv) return res.status(404).json({ message: 'Conversation not found' })
  const bundle = renderPreviewBundle({ prompt: firstPrompt(conv), answers: conv.answers, photos: conv.photos })
  const body = await gzipped(JSON.stringify(bundle))
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Encoding', 'gzip')
  res.send(body)
})

// Prepares the preview again: after one failed, or to refresh it by hand
router.post('/conversations/:id/preview-refresh', async (req, res) => {
  const conv = await owned(req)
  if (!conv) return res.status(404).json({ message: 'Conversation not found' })
  if (!conv.repositoryId) return res.status(409).json({ message: 'Your site has not been built yet' })
  const running = await Task.exists({ repositoryId: conv.repositoryId, status: { $in: ['pending', 'running'] } })
  if (running) return res.status(409).json({ message: 'Your site is still being worked on' })
  await queuePreview(String(conv.repositoryId), String(conv.userId))
  res.status(202).json({ conversation: await withStatus(conv) })
})

export default router
