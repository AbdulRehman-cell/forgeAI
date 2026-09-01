import cron from 'node-cron'
import { Prospect } from '../modules/outreach/prospect.model'
import { User } from '../modules/users/user.model'
import { sendWhatsAppMessage } from './whatsapp'

// Runs every hour. Finds pending WhatsApp sequence steps where the scheduled
// day has arrived, sends them via the user's WhatsApp Business credentials,
// and marks the step done.
export function startWAScheduler() {
  cron.schedule('0 * * * *', async () => {
    console.log('[WA Scheduler] tick —', new Date().toISOString())
    try {
      // Find prospects that have an active sequence with pending WhatsApp steps
      const prospects = await Prospect.find({
        sequenceStartedAt: { $exists: true, $ne: null },
        'sequence.platform': 'whatsapp',
        'sequence.status': 'pending',
      }).lean()

      for (const prospect of prospects) {
        const startedAt = prospect.sequenceStartedAt as Date
        if (!startedAt || !prospect.phone) continue

        // Load user to get their WhatsApp credentials
        const user = await User.findById(prospect.userId).select('settings').lean() as any
        const waToken: string = user?.settings?.waAccessToken ?? process.env.WA_ACCESS_TOKEN ?? ''
        const waPhoneId: string = user?.settings?.waPhoneNumberId ?? process.env.WA_PHONE_NUMBER_ID ?? ''
        if (!waToken || !waPhoneId) continue

        const now = Date.now()
        const msSinceStart = now - new Date(startedAt).getTime()

        for (let i = 0; i < prospect.sequence.length; i++) {
          const step = prospect.sequence[i]
          if (step.platform !== 'whatsapp' || step.status !== 'pending') continue

          // step.day is 1-based (Day 1 fires immediately, Day 3 fires after 2 days, etc.)
          const msRequired = (step.day - 1) * 24 * 60 * 60 * 1000
          if (msSinceStart < msRequired) continue

          // Time to send
          console.log(`[WA Scheduler] Sending to ${prospect.companyName} (${prospect.phone}) — step Day ${step.day}`)
          const result = await sendWhatsAppMessage(prospect.phone, step.message, waPhoneId, waToken)

          if (result.ok) {
            console.log(`  ✓ sent — messageId: ${result.messageId}`)
            await Prospect.updateOne(
              { _id: prospect._id, [`sequence.${i}.status`]: 'pending' },
              {
                $set: {
                  [`sequence.${i}.status`]: 'done',
                  [`sequence.${i}.doneAt`]: new Date(),
                },
              },
            )
          } else {
            console.warn(`  ✗ failed — ${result.error}`)
          }

          // 500 ms gap between sends to respect rate limits
          await new Promise(r => setTimeout(r, 500))
        }
      }
    } catch (err: any) {
      console.error('[WA Scheduler] error:', err?.message)
    }
  })

  console.log('[WA Scheduler] started — checks every hour')
}
