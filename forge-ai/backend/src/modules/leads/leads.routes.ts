import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import { Lead } from './lead.model'
import { Repository } from '../repository/repository.model'
import nodemailer from 'nodemailer'
import { google } from '../../lib/google'

const router = Router()

function makeTransport() {
  const host = process.env.SMTP_HOST
  if (!host) return null
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  })
}

// ── Rule-based lead scoring (0–100) ──────────────────────────
function scoreLead(email: string, phone?: string, message?: string): number {
  let score = 10
  const FREE_DOMAINS = ['gmail', 'yahoo', 'hotmail', 'outlook', 'protonmail', 'icloud', 'aol', 'live', 'msn']
  const domain = email.split('@')[1]?.split('.')[0]?.toLowerCase() ?? ''
  if (!FREE_DOMAINS.includes(domain)) score += 15
  if (phone?.trim()) score += 20
  if (message) {
    const m = message.toLowerCase()
    const words = message.split(/\s+/).length
    if (words >= 15) score += 10
    if (words >= 40) score += 5
    if (/urgent|asap|immediately|today|this week|right away/.test(m)) score += 20
    if (/budget|cost|price|quote|proposal|invest|purchase|buy/.test(m)) score += 15
    if (/need|require|looking for|want|interested in|would like/.test(m)) score += 5
  }
  return Math.min(100, score)
}

function priorityFromScore(score: number): string {
  if (score >= 70) return 'urgent'
  if (score >= 50) return 'high'
  if (score >= 30) return 'medium'
  return 'low'
}

// ── Best-effort webhook fire ──────────────────────────────────
async function fireWebhook(url: string, payload: object) {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'ForgeAI-Leads/1.0' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    })
  } catch (e: any) {
    console.error('[leads] Webhook failed:', e?.message)
  }
}

// ─── Public: contact form submission ─────────────────────────
router.post('/submit/:siteToken', async (req, res) => {
  const { name, email, phone, message, source } = req.body
  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ message: 'Name and email are required' })
  }

  const repo = await Repository.findOne({ shareToken: req.params.siteToken })
  if (!repo) return res.status(404).json({ message: 'Site not found' })

  const utmSource = String(req.query.utm_source ?? req.body.utmSource ?? '').trim() || undefined
  const utmMedium = String(req.query.utm_medium ?? req.body.utmMedium ?? '').trim() || undefined
  const utmCampaign = String(req.query.utm_campaign ?? req.body.utmCampaign ?? '').trim() || undefined

  const score = scoreLead(email.trim().toLowerCase(), phone, message)
  const priority = priorityFromScore(score)

  const lead = await Lead.create({
    siteRepositoryId: repo._id,
    ownerId: repo.userId,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone?.trim() || undefined,
    message: message?.trim() || undefined,
    source: source?.trim() || undefined,
    score,
    priority,
    utmSource,
    utmMedium,
    utmCampaign,
    activities: [{ type: 'note', body: `Submitted from ${repo.name}` }],
  })

  // SMTP notification to owner
  try {
    const transport = makeTransport()
    if (transport && process.env.SMTP_FROM) {
      const { User } = await import('../users/user.model')
      const owner = await User.findById(repo.userId)
      if (owner?.email) {
        const priorityColor = priority === 'urgent' ? '#ef4444' : priority === 'high' ? '#f59e0b' : '#6366f1'
        await transport.sendMail({
          from: process.env.SMTP_FROM,
          to: owner.email,
          subject: `New lead from ${repo.name}: ${name}`,
          html: `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
              <h2 style="color:#6366f1">New lead — ${repo.name}</h2>
              <p style="margin:0 0 16px;font-size:13px;color:#888">
                Score: <strong style="color:${priorityColor}">${score}/100</strong> &nbsp;·&nbsp;
                Priority: <strong style="color:${priorityColor}">${priority.toUpperCase()}</strong>
              </p>
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:8px 0;color:#888;width:100px">Name</td><td style="padding:8px 0;font-weight:600">${name}</td></tr>
                <tr><td style="padding:8px 0;color:#888">Email</td><td style="padding:8px 0"><a href="mailto:${email}">${email}</a></td></tr>
                ${phone ? `<tr><td style="padding:8px 0;color:#888">Phone</td><td style="padding:8px 0">${phone}</td></tr>` : ''}
                ${message ? `<tr><td style="padding:8px 0;color:#888;vertical-align:top">Message</td><td style="padding:8px 0">${message.replace(/\n/g, '<br>')}</td></tr>` : ''}
                ${utmSource ? `<tr><td style="padding:8px 0;color:#888">UTM Source</td><td style="padding:8px 0">${utmSource}</td></tr>` : ''}
              </table>
              <a href="${process.env.FRONTEND_URL}/leads" style="display:inline-block;margin-top:20px;background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">View in ForgeAI</a>
            </div>`,
        })
      }
    }
  } catch (err: any) {
    console.error('[leads] Notification failed:', err?.message)
  }

  // Gmail auto-reply + webhook
  try {
    const { User } = await import('../users/user.model')
    const owner = await User.findById(repo.userId).select(
      '+gmailRefreshToken gmailEmail leadAutoReply leadAutoReplyTemplate leadWebhookUrl',
    )

    if (owner?.leadAutoReply && owner.gmailRefreshToken) {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID!,
        process.env.GOOGLE_CLIENT_SECRET!,
        process.env.GOOGLE_REDIRECT_URI,
      )
      oauth2Client.setCredentials({ refresh_token: owner.gmailRefreshToken })
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
      const DEFAULT_TEMPLATE = `Hi {name},\n\nThank you for reaching out! We've received your message and will get back to you as soon as possible.\n\nBest regards,\n${repo.name}`
      const body = (owner.leadAutoReplyTemplate || DEFAULT_TEMPLATE)
        .replace(/{name}/g, name)
        .replace(/{site}/g, repo.name)
      const rawMessage = [
        `From: ${owner.gmailEmail}`,
        `To: ${email}`,
        `Subject: Re: Your enquiry to ${repo.name}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        '',
        body,
      ].join('\r\n')
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: Buffer.from(rawMessage).toString('base64url') },
      })
      await Lead.updateOne(
        { _id: lead._id },
        { $push: { activities: { type: 'email', body: 'Auto-reply sent via Gmail' } } },
      )
    }

    if (owner?.leadWebhookUrl) {
      fireWebhook(owner.leadWebhookUrl, {
        event: 'lead.created',
        lead: {
          id: String(lead._id),
          name, email, phone: phone || null, message: message || null,
          score, priority, source: source || null,
          site: repo.name,
          utmSource: utmSource || null,
          utmMedium: utmMedium || null,
          utmCampaign: utmCampaign || null,
          createdAt: lead.createdAt,
        },
      })
    }
  } catch (err: any) {
    console.error('[leads] Post-create actions failed:', err?.message)
  }

  res.status(201).json({ success: true, id: lead._id })
})

// ─── Auth-required ────────────────────────────────────────────
router.use(requireAuth)

/** Summary stats */
router.get('/stats', async (req, res) => {
  const user = req.user as any
  const ownerId = user._id
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [total, thisWeek, byStatus, bySite, unreadCount] = await Promise.all([
    Lead.countDocuments({ ownerId }),
    Lead.countDocuments({ ownerId, createdAt: { $gte: weekAgo } }),
    Lead.aggregate([{ $match: { ownerId } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Lead.aggregate([
      { $match: { ownerId } },
      { $group: { _id: '$siteRepositoryId', count: { $sum: 1 } } },
      { $lookup: { from: 'repositories', localField: '_id', foreignField: '_id', as: 'repo' } },
      { $unwind: { path: '$repo', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 1, name: '$repo.name', count: 1 } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
    Lead.countDocuments({ ownerId, read: false }),
  ])

  const statusMap: Record<string, number> = { new: 0, qualified: 0, contacted: 0, proposal: 0, converted: 0, lost: 0 }
  byStatus.forEach((s: any) => { if (s._id) statusMap[s._id] = s.count })

  res.json({ total, thisWeek, byStatus: statusMap, bySite, unreadCount })
})

/** Advanced analytics */
router.get('/analytics', async (req, res) => {
  const user = req.user as any
  const ownerId = user._id
  const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000)

  const [allLeads, bySource, byWeek, byPriority, scoreAgg] = await Promise.all([
    Lead.find({ ownerId }, 'status score dealValue priority createdAt updatedAt').lean(),
    Lead.aggregate([
      { $match: { ownerId, source: { $exists: true, $ne: '' } } },
      { $group: {
        _id: '$source',
        count: { $sum: 1 },
        converted: { $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] } },
        totalValue: { $sum: { $ifNull: ['$dealValue', 0] } },
      }},
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    Lead.aggregate([
      { $match: { ownerId, createdAt: { $gte: eightWeeksAgo } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-W%V', date: '$createdAt' } },
        count: { $sum: 1 },
        converted: { $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] } },
      }},
      { $sort: { _id: 1 } },
    ]),
    Lead.aggregate([
      { $match: { ownerId } },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]),
    Lead.aggregate([
      { $match: { ownerId } },
      { $group: { _id: null, avg: { $avg: '$score' }, totalValue: { $sum: { $ifNull: ['$dealValue', 0] } } } },
    ]),
  ])

  const total = allLeads.length
  const converted = allLeads.filter((l: any) => l.status === 'converted').length
  const conversionRate = total > 0 ? converted / total : 0

  const closedLeads = allLeads.filter((l: any) => l.status === 'converted')
  const avgTimeToClose = closedLeads.length > 0
    ? closedLeads.reduce((s: number, l: any) => s + (new Date(l.updatedAt).getTime() - new Date(l.createdAt).getTime()), 0)
      / closedLeads.length / (1000 * 60 * 60 * 24)
    : 0

  const STAGES = ['new', 'qualified', 'contacted', 'proposal', 'converted']
  const funnel = STAGES.map(stage => ({
    stage,
    count: allLeads.filter((l: any) => l.status === stage).length,
    rate: total > 0 ? allLeads.filter((l: any) => l.status === stage).length / total : 0,
  }))

  const priorityMap: Record<string, number> = { urgent: 0, high: 0, medium: 0, low: 0 }
  byPriority.forEach((p: any) => { if (p._id) priorityMap[p._id] = p.count })

  res.json({
    total,
    conversionRate: Math.round(conversionRate * 1000) / 10,
    avgTimeToClose: Math.round(avgTimeToClose * 10) / 10,
    avgScore: Math.round((scoreAgg[0]?.avg ?? 0) * 10) / 10,
    totalValue: scoreAgg[0]?.totalValue ?? 0,
    funnel,
    bySource,
    byWeek,
    byPriority: priorityMap,
  })
})

/** Kanban pipeline data */
router.get('/pipeline', async (req, res) => {
  const user = req.user as any
  const STATUSES = ['new', 'qualified', 'contacted', 'proposal', 'converted', 'lost']
  const columns = await Promise.all(
    STATUSES.map(async (status) => {
      const leads = await Lead.find({ ownerId: user._id, status })
        .sort({ score: -1, createdAt: -1 })
        .populate('siteRepositoryId', 'name')
        .limit(50)
      const totalValue = leads.reduce((sum: number, l: any) => sum + (l.dealValue ?? 0), 0)
      return { status, leads, count: leads.length, totalValue }
    }),
  )
  res.json({ columns })
})

/** Follow-ups due today/tomorrow */
router.get('/follow-ups', async (req, res) => {
  const user = req.user as any
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(23, 59, 59, 999)
  const leads = await Lead.find({
    ownerId: user._id,
    followUpAt: { $lte: tomorrow },
    status: { $nin: ['converted', 'lost'] },
  })
    .sort({ followUpAt: 1 })
    .populate('siteRepositoryId', 'name')
    .limit(20)
  res.json({ leads })
})

/** CSV export */
router.get('/export', async (req, res) => {
  const user = req.user as any
  const { siteId, status } = req.query
  const filter: any = { ownerId: user._id }
  if (siteId) filter.siteRepositoryId = siteId
  if (status) filter.status = status

  const leads = await Lead.find(filter)
    .sort({ createdAt: -1 })
    .populate('siteRepositoryId', 'name')
    .limit(10000)

  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = [
    ['Name', 'Email', 'Phone', 'Company', 'Job Title', 'Message', 'Status', 'Priority', 'Score',
      'Deal Value', 'Tags', 'Site', 'Source', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'Date'].map(esc).join(','),
    ...leads.map((l: any) => [
      l.name, l.email, l.phone ?? '', l.company ?? '', l.jobTitle ?? '', l.message ?? '',
      l.status, l.priority ?? '', l.score ?? 0, l.dealValue ?? '',
      (l.tags ?? []).join(';'), l.siteRepositoryId?.name ?? '', l.source ?? '',
      l.utmSource ?? '', l.utmMedium ?? '', l.utmCampaign ?? '',
      new Date(l.createdAt).toISOString(),
    ].map(esc).join(',')),
  ]

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"')
  res.send(rows.join('\n'))
})

/** CSV import */
router.post('/import', async (req, res) => {
  const user = req.user as any
  const { csv, siteId } = req.body
  if (!csv || typeof csv !== 'string') return res.status(400).json({ message: 'csv string required' })

  const repo = siteId ? await Repository.findOne({ _id: siteId, userId: user._id }) : null
  const lines = csv.split('\n').map((l: string) => l.trim()).filter(Boolean)
  if (lines.length < 2) return res.status(400).json({ message: 'CSV needs header + at least one data row' })

  const parseCSVLine = (line: string): string[] => {
    const cols: string[] = []
    let cur = '', inQ = false
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue }
      if (ch === ',' && !inQ) { cols.push(cur); cur = ''; continue }
      cur += ch
    }
    cols.push(cur)
    return cols
  }

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim())
  const idx = (name: string) => headers.findIndex(h => h.includes(name))
  const nameIdx = idx('name'), emailIdx = idx('email')

  if (nameIdx === -1 || emailIdx === -1) {
    return res.status(400).json({ message: 'CSV must have "name" and "email" columns' })
  }

  const phoneIdx = idx('phone'), msgIdx = idx('message'), companyIdx = idx('company'),
    sourceIdx = idx('source'), jobIdx = idx('job'), dealIdx = idx('deal')

  const toInsert = []
  for (let i = 1; i < Math.min(lines.length, 5001); i++) {
    const cols = parseCSVLine(lines[i])
    const name = cols[nameIdx]?.trim()
    const email = cols[emailIdx]?.trim().toLowerCase()
    if (!name || !email || !email.includes('@')) continue
    const phone = phoneIdx >= 0 ? cols[phoneIdx]?.trim() || undefined : undefined
    const message = msgIdx >= 0 ? cols[msgIdx]?.trim() || undefined : undefined
    const score = scoreLead(email, phone, message)
    toInsert.push({
      ownerId: user._id,
      siteRepositoryId: repo?._id,
      name, email, phone, message,
      company: companyIdx >= 0 ? cols[companyIdx]?.trim() || undefined : undefined,
      jobTitle: jobIdx >= 0 ? cols[jobIdx]?.trim() || undefined : undefined,
      dealValue: dealIdx >= 0 ? Number(cols[dealIdx]?.replace(/[^0-9.]/g, '')) || undefined : undefined,
      source: sourceIdx >= 0 ? cols[sourceIdx]?.trim() || 'csv_import' : 'csv_import',
      score,
      priority: priorityFromScore(score),
      activities: [{ type: 'note', body: 'Imported via CSV' }],
    })
  }

  if (!toInsert.length) return res.status(400).json({ message: 'No valid rows found in CSV' })
  const result = await Lead.insertMany(toInsert, { ordered: false })
  res.json({ imported: result.length, total: lines.length - 1 })
})

/** Webhook settings */
router.get('/webhook-settings', async (req, res) => {
  const user = req.user as any
  const { User } = await import('../users/user.model')
  const u = await User.findById(user._id).select('leadWebhookUrl')
  res.json({ webhookUrl: u?.leadWebhookUrl ?? '' })
})

router.put('/webhook-settings', async (req, res) => {
  const user = req.user as any
  const { webhookUrl } = req.body
  const { User } = await import('../users/user.model')
  await User.findByIdAndUpdate(user._id, { leadWebhookUrl: webhookUrl ?? '' })
  res.json({ ok: true })
})

/** All leads with filtering + pagination */
router.get('/', async (req, res) => {
  const user = req.user as any
  const { siteId, status, priority, unread, limit = 50, skip = 0, search, sort = 'newest' } = req.query
  const filter: any = { ownerId: user._id }
  if (siteId) filter.siteRepositoryId = siteId
  if (status) filter.status = status
  if (priority) filter.priority = priority
  if (unread === 'true') filter.read = false
  if (search) {
    const re = new RegExp(String(search), 'i')
    filter.$or = [{ name: re }, { email: re }, { message: re }, { company: re }, { tags: re }]
  }

  const sortMap: Record<string, any> = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    score: { score: -1 },
    value: { dealValue: -1 },
    followup: { followUpAt: 1 },
  }

  const [leads, total] = await Promise.all([
    Lead.find(filter)
      .sort(sortMap[String(sort)] ?? { createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .populate('siteRepositoryId', 'name'),
    Lead.countDocuments(filter),
  ])
  res.json({ leads, total })
})

/** Add activity to lead */
router.post('/:id/activity', async (req, res) => {
  const user = req.user as any
  const { type, body } = req.body
  if (!type || !body) return res.status(400).json({ message: 'type and body required' })
  const lead = await Lead.findOneAndUpdate(
    { _id: req.params.id, ownerId: user._id },
    { $push: { activities: { type, body } } },
    { new: true },
  ).populate('siteRepositoryId', 'name')
  if (!lead) return res.status(404).json({ message: 'Not found' })
  res.json({ lead })
})

/** AI Smart Reply draft */
router.post('/:id/smart-reply', async (req, res) => {
  const user = req.user as any
  const lead = await Lead.findOne({ _id: req.params.id, ownerId: user._id })
    .populate('siteRepositoryId', 'name')
  if (!lead) return res.status(404).json({ message: 'Not found' })

  try {
    const { createProvider } = await import('../ai/ai.factory')
    const provider = createProvider('gemini')
    const siteName = (lead.siteRepositoryId as any)?.name ?? 'our company'
    const contextLines = [
      lead.message ? `Their message: "${lead.message}"` : 'No message provided.',
      lead.company ? `Company: ${lead.company}` : '',
      lead.jobTitle ? `Job title: ${lead.jobTitle}` : '',
    ].filter(Boolean).join('\n')

    const resp = await provider.chat([{
      role: 'user',
      content: `Write a professional, warm, personalized reply email from ${siteName} to a lead named ${lead.name} (${lead.email}).\n\n${contextLines}\n\nReturn ONLY valid JSON with keys "subject" (string) and "body" (string, 3-4 paragraphs). Sign off as "The ${siteName} Team". No explanation, just JSON.`,
    }])

    const match = resp.content.match(/\{[\s\S]*"subject"[\s\S]*"body"[\s\S]*\}/)
    if (!match) throw new Error('No JSON in AI response')
    const { subject, body } = JSON.parse(match[0])
    res.json({ subject: String(subject), body: String(body) })
  } catch (err: any) {
    console.error('[leads] Smart reply failed:', err?.message)
    res.status(500).json({ message: 'AI reply generation failed, please try again' })
  }
})

/** Mark leads as read */
router.patch('/read', async (req, res) => {
  const user = req.user as any
  const { ids } = req.body
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'ids[] required' })
  await Lead.updateMany({ _id: { $in: ids }, ownerId: user._id }, { read: true })
  res.json({ updated: ids.length })
})

/** Update single lead */
router.patch('/:id', async (req, res) => {
  const user = req.user as any
  const { status, notes, read, priority, tags, dealValue, company, jobTitle, followUpAt, followUpNote } = req.body
  const $set: any = {}
  if (status !== undefined) $set.status = status
  if (notes !== undefined) $set.notes = notes
  if (read !== undefined) $set.read = read
  if (priority !== undefined) $set.priority = priority
  if (tags !== undefined) $set.tags = tags
  if (dealValue !== undefined) $set.dealValue = dealValue
  if (company !== undefined) $set.company = company
  if (jobTitle !== undefined) $set.jobTitle = jobTitle
  if (followUpAt !== undefined) $set.followUpAt = followUpAt || null
  if (followUpNote !== undefined) $set.followUpNote = followUpNote

  const update: any = { $set }
  if (status !== undefined) {
    update.$push = { activities: { type: 'status_change', body: `Status → ${status}` } }
  }

  const lead = await Lead.findOneAndUpdate(
    { _id: req.params.id, ownerId: user._id },
    update,
    { new: true },
  ).populate('siteRepositoryId', 'name')

  if (!lead) return res.status(404).json({ message: 'Not found' })
  res.json({ lead })
})

/** Bulk delete */
router.delete('/bulk', async (req, res) => {
  const user = req.user as any
  const { ids } = req.body
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'ids[] required' })
  const result = await Lead.deleteMany({ _id: { $in: ids }, ownerId: user._id })
  res.json({ deleted: result.deletedCount })
})

/** Delete single lead */
router.delete('/:id', async (req, res) => {
  const user = req.user as any
  const deleted = await Lead.findOneAndDelete({ _id: req.params.id, ownerId: user._id })
  if (!deleted) return res.status(404).json({ message: 'Not found' })
  res.json({ deleted: true })
})

export default router
