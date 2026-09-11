import nodemailer from 'nodemailer'
import { User } from '../modules/users/user.model'
import { Task } from '../modules/tasks/task.model'
import { Repository } from '../modules/repository/repository.model'

function makeTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
}

function formatRow(task: any, repoName: string, memberEmail: string): string {
  const date = new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const status = task.status === 'completed' ? '✅' : task.status === 'failed' ? '❌' : '⏳'
  return `<tr>
    <td style="padding:6px 10px;border-bottom:1px solid #2a2a40;">${status} ${task.type.replace(/_/g, ' ')}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #2a2a40;">${memberEmail}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #2a2a40;">${repoName}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #2a2a40;color:#a0a0c0;">${date}</td>
  </tr>`
}

async function sendDigest(ownerId: string) {
  const transport = makeTransport()
  if (!transport) return

  const owner = await User.findById(ownerId)
  if (!owner || !owner.teamDigestEnabled) return

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const memberIds = (owner.teamMembers ?? [])
    .filter((m: any) => m.accepted && m.userId)
    .map((m: any) => m.userId)

  if (!memberIds.length) return

  const tasks = await Task.find({ userId: { $in: memberIds }, createdAt: { $gte: weekAgo } })
    .sort({ createdAt: -1 })
    .lean()

  const repoIds = [...new Set(tasks.map(t => t.repositoryId?.toString()))]
  const repos = await Repository.find({ _id: { $in: repoIds } }).select('name').lean()
  const repoMap = Object.fromEntries(repos.map((r: any) => [r._id.toString(), r.name]))

  const memberEmailMap: Record<string, string> = {}
  for (const m of (owner.teamMembers ?? []) as any[]) {
    if (m.userId) memberEmailMap[m.userId.toString()] = m.email
  }

  const completed = tasks.filter(t => t.status === 'completed').length
  const failed = tasks.filter(t => t.status === 'failed').length
  const awaiting = tasks.filter(t => t.status === 'awaiting_approval').length

  const rows = tasks
    .slice(0, 30)
    .map(t => formatRow(t, repoMap[t.repositoryId?.toString()] ?? 'Unknown', memberEmailMap[t.userId?.toString()] ?? 'Unknown'))
    .join('')

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0d0d1a;font-family:system-ui,sans-serif;color:#e0e0f0;">
<div style="max-width:640px;margin:30px auto;background:#13131f;border-radius:12px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:28px 32px;">
    <h1 style="margin:0;font-size:22px;font-weight:700;">🔥 Weekly Team Digest</h1>
    <p style="margin:6px 0 0;opacity:0.85;font-size:14px;">AI activity summary for your team — past 7 days</p>
  </div>
  <div style="padding:24px 32px;">
    <div style="display:flex;gap:16px;margin-bottom:24px;">
      <div style="flex:1;background:#1a1a2e;border-radius:8px;padding:14px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#6ee7b7;">${completed}</div>
        <div style="font-size:12px;color:#a0a0c0;margin-top:4px;">Completed</div>
      </div>
      <div style="flex:1;background:#1a1a2e;border-radius:8px;padding:14px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#fca5a5;">${failed}</div>
        <div style="font-size:12px;color:#a0a0c0;margin-top:4px;">Failed</div>
      </div>
      <div style="flex:1;background:#1a1a2e;border-radius:8px;padding:14px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#fbbf24;">${awaiting}</div>
        <div style="font-size:12px;color:#a0a0c0;margin-top:4px;">Awaiting Approval</div>
      </div>
      <div style="flex:1;background:#1a1a2e;border-radius:8px;padding:14px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#a78bfa;">${tasks.length}</div>
        <div style="font-size:12px;color:#a0a0c0;margin-top:4px;">Total Tasks</div>
      </div>
    </div>
    ${tasks.length ? `
    <h2 style="font-size:14px;font-weight:600;color:#a0a0c0;text-transform:uppercase;letter-spacing:.06em;margin:0 0 12px;">Recent Tasks</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="color:#6060a0;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">
          <th style="padding:6px 10px;text-align:left;">Task</th>
          <th style="padding:6px 10px;text-align:left;">Member</th>
          <th style="padding:6px 10px;text-align:left;">Repo</th>
          <th style="padding:6px 10px;text-align:left;">Date</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>` : '<p style="color:#6060a0;font-size:14px;">No AI tasks this week.</p>'}
    <div style="margin-top:24px;padding-top:20px;border-top:1px solid #2a2a40;font-size:12px;color:#6060a0;text-align:center;">
      ForgeAI — Team features &nbsp;·&nbsp; Manage digest in Team Settings
    </div>
  </div>
</div>
</body></html>`

  await transport.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: owner.email,
    subject: `ForgeAI Weekly Digest — ${tasks.length} team tasks this week`,
    html,
  })

  owner.teamDigestLastSent = new Date()
  await owner.save()
}

/** Run once — sends digests to all owners that have it enabled and haven't received one in 6+ days. */
export async function runTeamDigests() {
  const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
  const owners = await User.find({
    teamDigestEnabled: true,
    teamOwnerId: { $exists: false },
    $or: [{ teamDigestLastSent: { $exists: false } }, { teamDigestLastSent: { $lt: sixDaysAgo } }],
  }).select('_id email teamDigestEnabled teamDigestLastSent teamMembers')

  for (const owner of owners) {
    try {
      await sendDigest(owner._id.toString())
      console.log(`[digest] Sent weekly digest to ${owner.email}`)
    } catch (err: any) {
      console.warn(`[digest] Failed for ${owner.email}:`, err.message)
    }
  }
}

/** Start the weekly digest scheduler — runs every 6 hours, sends only when due. */
export function startDigestScheduler() {
  const SIX_HOURS = 6 * 60 * 60 * 1000
  setInterval(async () => {
    try { await runTeamDigests() } catch (err: any) { console.warn('[digest] scheduler error:', err.message) }
  }, SIX_HOURS)
  console.log('[digest] Weekly team digest scheduler started (checks every 6h)')
}
