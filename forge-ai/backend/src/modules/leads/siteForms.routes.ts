// ─── Public: forms on generated static sites ─────────────────────────────────
// lib/siteForms.ts posts every contact, booking and newsletter form here as
// [label, value, type, name] rows. Any form shape is accepted: the name, email,
// phone and message are found by label, the rest becomes "Label: value" lines,
// and the result lands in the site owner's Leads inbox via recordLead().

import express, { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { Repository } from '../repository/repository.model'
import { recordLead } from './leads.routes'

const router = Router()

/** The visitor's address: Render's proxy puts it first in X-Forwarded-For */
function clientIp(req: express.Request): string {
  const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()
  return fwd || req.socket.remoteAddress || 'unknown'
}

// Per visitor per site — a real person sends a handful of messages, a script hundreds
const limiter = rateLimit({
  windowMs: 10 * 60_000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${clientIp(req)}|${req.params.siteToken}`,
  validate: { xForwardedForHeader: false, ip: false },
  message: { message: 'Too many messages from this device — please try again later.' },
})

type Row = [string, string, string, string]

const has = (row: Row, re: RegExp) => re.test(row[0]) || re.test(row[3])

export function leadFromRows(rows: Row[]): { name: string; email?: string; phone?: string; message?: string } | null {
  const left = rows.slice()
  const take = (test: (r: Row) => boolean) => {
    const i = left.findIndex(test)
    return i < 0 ? undefined : left.splice(i, 1)[0][1]
  }
  // Labels may be Urdu or Arabic: نام / الاسم, فون / هاتف, پیغام / رسالة
  const email = take((r) => ((r[2] === 'email' || has(r, /e-?mail|ای میل|البريد/i)) && /@/.test(r[1])) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r[1]))
  const phone = take((r) => r[2] === 'tel' || has(r, /phone|mobile|whats ?app|\btel\b|cell|contact number|فون|موبائل|نمبر|هاتف|جوال|واتس/i)
    // "Your number: 0300 1234567" — a phone by its value, unless the field is a date, count or amount
    || (/^\+?[\d\s().-]{7,}$/.test(r[1]) && (r[1].match(/\d/g) ?? []).length >= 7 && !/^date|time|number$/.test(r[2])
      && !/^\d{4}-\d{2}-\d{2}|^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(r[1]) && !/date|day|when|time|budget|price|amount|guests?|people|age|size|postcode|zip/i.test(`${r[0]} ${r[3]}`)))
  const first = take((r) => has(r, /first.?name|given.?name/i))
  const last = take((r) => has(r, /last.?name|surname|family.?name/i))
  const full = first || last ? undefined : take((r) => has(r, /name|نام|الاسم|اسمك/i) && !has(r, /company|business|organi[sz]ation|pet|child|baby|event|user.?name|کمپنی|الشركة/i))
  const note = take((r) => r[2] === 'textarea' || has(r, /message|comment|enquiry|inquiry|question|details|notes?|anything|tell us|پیغام|تفصیل|رسالة|ملاحظات/i))
  const extra = left.map((r) => `${r[0]}: ${r[1]}`)
  const message = [...extra, ...(note ? [extra.length ? `Message: ${note}` : note] : [])].join('\n') || undefined
  // Nobody can answer a message without a way to reach its sender
  if (!email && !phone) return null
  const name = [first, last].filter(Boolean).join(' ') || full || (email ? email.split('@')[0] : '') || 'Website visitor'
  return { name: name.slice(0, 120), email, phone: phone?.slice(0, 40), message: message?.slice(0, 5000) }
}

router.post(
  '/:siteToken',
  express.text({ type: ['text/plain', 'application/json'], limit: '24kb' }),
  limiter,
  async (req, res) => {
    let body: any = req.body
    if (typeof body === 'string') {
      try { body = JSON.parse(body) } catch { return res.status(400).json({ message: 'Unreadable form' }) }
    }
    // Bots fill the hidden field — accept quietly, keep nothing
    if (String(body?.hp ?? '').trim()) return res.status(201).json({ success: true })
    const rows: Row[] = (Array.isArray(body?.fields) ? body.fields : [])
      .slice(0, 30)
      .filter((r: unknown) => Array.isArray(r) && typeof r[0] === 'string' && typeof r[1] === 'string')
      .map((r: string[]) => [r[0].slice(0, 80), r[1].slice(0, 2000), String(r[2] ?? '').slice(0, 20), String(r[3] ?? '').slice(0, 60)] as Row)
    const lead = leadFromRows(rows)
    if (!lead) return res.status(400).json({ message: 'Add a phone number or email so the business can reply' })

    const repo = await Repository.findOne({ shareToken: req.params.siteToken })
    if (!repo) return res.status(404).json({ message: 'Site not found' })

    const params = new URLSearchParams(String(body.ref ?? '').replace(/^\?/, ''))
    const page = String(body.page ?? '').slice(0, 120)
    const form = String(body.form ?? '').slice(0, 120)
    const saved = await recordLead(repo, {
      ...lead,
      source: [form, page].filter(Boolean).join(' · ') || 'Website form',
      utmSource: params.get('utm_source')?.slice(0, 80) || undefined,
      utmMedium: params.get('utm_medium')?.slice(0, 80) || undefined,
      utmCampaign: params.get('utm_campaign')?.slice(0, 80) || undefined,
    })
    res.status(201).json({ success: true, id: saved._id })
  },
)

export default router
