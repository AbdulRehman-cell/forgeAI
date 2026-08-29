// backend/src/modules/billing/billing.routes.ts — REPLACE
import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import { User } from '../users/user.model'
import { PLANS } from '../../lib/plans'

const router = Router()

router.get('/plans', (_req, res) => {
  res.json({
    plans: Object.entries(PLANS).map(([id, p]) => ({
      id, name: p.name, price: p.price,
      limits: Object.fromEntries(
        Object.entries(p.limits).map(([k, v]) => [k, v === Infinity ? 'Unlimited' : v])
      ),
    })),
  })
})

router.use(requireAuth)

router.get('/me', async (req, res) => {
  const authed = req.user as any
  const user = await User.findById(authed._id)
  if (!user) return res.status(404).json({ message: 'Not found' })
  const limits = PLANS[user.plan].limits
  res.json({
    plan: user.plan,
    planName: PLANS[user.plan].name,
    price: PLANS[user.plan].price,
    usage: {
      fixes: { used: user.usage.fixes, limit: limits.fixes === Infinity ? null : limits.fixes },
      chats: { used: user.usage.chats, limit: limits.chats === Infinity ? null : limits.chats },
      reviews: { used: user.usage.reviews, limit: limits.reviews === Infinity ? null : limits.reviews },
      deploys: { used: user.usage.deploys ?? 0, limit: limits.deploys === Infinity ? null : limits.deploys },
    },
    resetAt: user.usage.resetAt,
  })
})

// ─── Change plan: upgrade OR downgrade, any direction ─────
// BUG FIX: previously only accepted 'pro'|'team' and the frontend blocked
// switching when already on a paid plan. Now accepts all three plans and
// handles pro→team, team→pro, and downgrades to free.
router.post('/change-plan', async (req, res) => {
  const authed = req.user as any
  const { plan } = req.body
  if (!['free', 'pro', 'team'].includes(plan)) {
    return res.status(400).json({ message: 'Invalid plan' })
  }

  const user = await User.findById(authed._id)
  if (!user) return res.status(404).json({ message: 'Not found' })
  if (user.plan === plan) {
    return res.status(400).json({ message: `Already on the ${plan} plan` })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY

  // Downgrade to free — cancel subscription if Stripe is live
  if (plan === 'free') {
    if (stripeKey && user.stripeSubscriptionId) {
      const Stripe = require('stripe')
      const stripe = new Stripe(stripeKey)
      try { await stripe.subscriptions.cancel(user.stripeSubscriptionId) } catch {}
    }
    user.plan = 'free'
    user.stripeSubscriptionId = undefined
    await user.save()
    return res.json({ message: 'Downgraded to Free', plan: 'free' })
  }

  // Paid plan change
  if (stripeKey) {
    const Stripe = require('stripe')
    const stripe = new Stripe(stripeKey)
    const priceId = plan === 'pro' ? process.env.STRIPE_PRICE_PRO : process.env.STRIPE_PRICE_TEAM

    // Existing subscriber switching tiers → update subscription in place
    if (user.stripeSubscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId)
        await stripe.subscriptions.update(user.stripeSubscriptionId, {
          items: [{ id: sub.items.data[0].id, price: priceId }],
          proration_behavior: 'create_prorations',
        })
        user.plan = plan
        await user.save()
        return res.json({ message: `Switched to ${PLANS[plan as 'pro'|'team'].name}`, plan })
      } catch {
        // fall through to new checkout
      }
    }

    // New subscriber → checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/settings?upgraded=true`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing`,
      metadata: { userId: authed._id.toString(), plan },
    })
    return res.json({ checkoutUrl: session.url })
  }

  // Dev mode — instant switch
  user.plan = plan
  await user.save()
  res.json({ message: `Switched to ${PLANS[plan as 'pro'|'team'].name} (dev mode)`, plan })
})

// Back-compat alias
router.post('/upgrade', (req, res, next) => {
  req.url = '/change-plan'
  next()
})

export async function stripeWebhook(req: any, res: any) {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) return res.status(501).json({ message: 'Stripe not configured' })
  const Stripe = require('stripe')
  const stripe = new Stripe(stripeKey)
  let event
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err: any) {
    return res.status(400).send(`Webhook error: ${err.message}`)
  }
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object
    await User.findByIdAndUpdate(s.metadata.userId, {
      plan: s.metadata.plan, stripeCustomerId: s.customer, stripeSubscriptionId: s.subscription,
    })
  }
  if (event.type === 'customer.subscription.deleted') {
    await User.findOneAndUpdate({ stripeSubscriptionId: event.data.object.id }, { plan: 'free' })
  }
  res.json({ received: true })
}

export default router
