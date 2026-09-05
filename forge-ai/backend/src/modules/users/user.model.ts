import { Schema, model, Document, Types } from 'mongoose'
import bcrypt from 'bcryptjs'

export type Plan = 'free' | 'pro' | 'team'

export interface IUser extends Document {
  name: string
  email: string
  password?: string
  avatar?: string
  githubId?: string
  githubAccessToken?: string
  githubConnected: boolean
  aiProvider: 'openai' | 'claude' | 'gemini' | 'github'
  // ── Deploy platform tokens (Blitz Deploy) ──
  deployTokens?: {
    vercel?: string
    railway?: string
    render?: string
  }
  // ── Dashboard source connections (per-user OAuth grants) ──
  dashboardTokens?: {
    google?: {
      accessToken: string
      refreshToken?: string
      expiresAt?: number
      scope?: string
    }
    stripe?: {
      accessToken: string
      /** stripe_user_id — the connected account id, used as Stripe-Account header on API calls. */
      stripeUserId: string
      /** Livemode vs test — Stripe returns this on the OAuth response. */
      livemode?: boolean
      scope?: string
    }
  }
  // ── Billing ──
  plan: Plan
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  planExpiresAt?: Date
  // ── Usage (resets monthly) ──
  usage: {
    fixes: number
    chats: number
    reviews: number
    deploys: number
    resetAt: Date
  }
  // ── Agency white-label (Pro/Team) ──
  whiteLabel?: {
    brandName?: string
    logoUrl?: string
    primaryColor?: string
    supportEmail?: string
  }
  // ── Team seats ──
  teamMembers?: Array<{
    email: string
    role: 'admin' | 'member'
    inviteToken?: string
    accepted: boolean
    invitedAt: Date
    userId?: Types.ObjectId
  }>
  // ── Team membership (set when this user accepted someone else's invite) ──
  teamOwnerId?: Types.ObjectId
  teamRole?: 'admin' | 'member'
  // ── WhatsApp Business API credentials ──
  settings?: {
    waAccessToken?: string
    waPhoneNumberId?: string
    waDisplayPhone?: string
    waVerifiedName?: string
  }
  // ── Gmail OAuth (for cold outreach) ──
  gmailRefreshToken?: string
  gmailEmail?: string
  // ── Lead auto-reply & webhook ──
  leadAutoReply?: boolean
  leadAutoReplyTemplate?: string
  leadWebhookUrl?: string
  createdAt: Date
  updatedAt: Date
  comparePassword(candidate: string): Promise<boolean>
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, select: false },
    avatar: String,
    githubId: { type: String, unique: true, sparse: true },
    githubAccessToken: { type: String, select: false },
    githubConnected: { type: Boolean, default: false },
    aiProvider: { type: String, enum: ['openai', 'claude', 'gemini', 'github'], default: 'github' },
    deployTokens: {
      vercel: { type: String, select: false },
      railway: { type: String, select: false },
      render: { type: String, select: false },
    },
    dashboardTokens: {
      google: {
        accessToken: { type: String, select: false },
        refreshToken: { type: String, select: false },
        expiresAt: Number,
        scope: String,
      },
      stripe: {
        accessToken: { type: String, select: false },
        stripeUserId: String,
        livemode: Boolean,
        scope: String,
      },
    },
    plan: { type: String, enum: ['free', 'pro', 'team'], default: 'free' },
    stripeCustomerId: String,
    stripeSubscriptionId: String,
    planExpiresAt: Date,
    usage: {
      fixes: { type: Number, default: 0 },
      chats: { type: Number, default: 0 },
      reviews: { type: Number, default: 0 },
      deploys: { type: Number, default: 0 },
      resetAt: { type: Date, default: () => nextMonthStart() },
    },
    whiteLabel: {
      brandName: String,
      logoUrl: String,
      primaryColor: String,
      supportEmail: String,
    },
    teamMembers: [
      {
        email: { type: String, lowercase: true },
        role: { type: String, enum: ['admin', 'member'], default: 'member' },
        inviteToken: { type: String, select: false },
        accepted: { type: Boolean, default: false },
        invitedAt: { type: Date, default: Date.now },
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
      },
    ],
    teamOwnerId: { type: Schema.Types.ObjectId, ref: 'User' },
    teamRole: { type: String, enum: ['admin', 'member'] },
    settings: {
      waAccessToken: { type: String, select: false },
      waPhoneNumberId: String,
      waDisplayPhone: String,
      waVerifiedName: String,
    },
    gmailRefreshToken: { type: String, select: false },
    gmailEmail: String,
    leadAutoReply: { type: Boolean, default: false },
    leadAutoReplyTemplate: String,
    leadWebhookUrl: String,
  },
  { timestamps: true },
)

export function nextMonthStart(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 1)
}

userSchema.pre('save', async function () {
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, 12)
  }
})

userSchema.methods.comparePassword = function (candidate: string) {
  return bcrypt.compare(candidate, this.password ?? '')
}

export const User = model<IUser>('User', userSchema)
