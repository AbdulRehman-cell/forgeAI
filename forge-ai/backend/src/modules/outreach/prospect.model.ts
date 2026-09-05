import { Schema, model, Document, Types } from 'mongoose'

export type ProspectStatus = 'new' | 'researched' | 'ready' | 'sent' | 'replied' | 'converted' | 'lost'
export type EmailTone = 'professional' | 'friendly' | 'bold' | 'concise'
export type ActivityType = 'note' | 'call' | 'email' | 'meeting' | 'linkedin' | 'instagram' | 'status_change'
export type SequencePlatform = 'linkedin' | 'instagram' | 'email' | 'twitter' | 'whatsapp'
export type SequenceAction = 'connect' | 'message' | 'comment' | 'email' | 'follow_up' | 'dm' | 'whatsapp'
export type SequenceStatus = 'pending' | 'done' | 'skipped'

export interface ISequenceStep {
  day: number
  platform: SequencePlatform
  action: SequenceAction
  message: string
  subject?: string
  status: SequenceStatus
  doneAt?: Date
}

export interface IProspectActivity {
  type: ActivityType
  body: string
  createdAt: Date
}

export interface IEmailVariant {
  label: string
  subject: string
  body: string
  tone: string
}

export interface IProspect extends Document {
  userId: Types.ObjectId
  // Identity
  companyName: string
  website?: string
  contactName?: string
  contactEmail?: string
  industry?: string
  location?: string
  linkedinUrl?: string
  instagramUrl?: string
  // Scraped intelligence
  scrapedSummary?: string
  scrapedEmails: string[]
  phone?: string
  painPoints?: string
  // AI-generated email
  generatedSubject?: string
  generatedEmail?: string
  emailTone?: EmailTone
  personalizedOpener?: string
  // A/B variants
  variants: IEmailVariant[]
  // Campaign
  campaignName?: string
  // Scoring & enrichment
  score: number
  tags: string[]
  // Follow-up
  followUpAt?: Date
  followUpNote?: string
  lastContactedAt?: Date
  // Activity log
  activities: IProspectActivity[]
  // Multi-channel outreach sequence
  sequence: ISequenceStep[]
  sequenceStartedAt?: Date   // set when auto-send is enabled; scheduler uses this to fire steps on the right day
  // Workflow
  status: ProspectStatus
  notes?: string
  // Timestamps
  scrapedAt?: Date
  emailGeneratedAt?: Date
  sentAt?: Date
  repliedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const activitySchema = new Schema<IProspectActivity>(
  {
    type: { type: String, enum: ['note', 'call', 'email', 'meeting', 'linkedin', 'status_change'], required: true },
    body: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

const sequenceStepSchema = new Schema<ISequenceStep>(
  {
    day: { type: Number, required: true },
    platform: { type: String, enum: ['linkedin', 'instagram', 'email', 'twitter', 'whatsapp'], required: true },
    action: { type: String, enum: ['connect', 'message', 'comment', 'email', 'follow_up', 'dm', 'whatsapp'], required: true },
    message: { type: String, required: true },
    subject: String,
    status: { type: String, enum: ['pending', 'done', 'skipped'], default: 'pending' },
    doneAt: Date,
  },
  { _id: false },
)

const variantSchema = new Schema<IEmailVariant>(
  {
    label: { type: String, required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    tone: { type: String, default: 'professional' },
  },
  { _id: false },
)

const prospectSchema = new Schema<IProspect>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    companyName: { type: String, required: true },
    website: String,
    contactName: String,
    contactEmail: String,
    industry: String,
    location: String,
    linkedinUrl: String,
    instagramUrl: String,
    scrapedSummary: String,
    scrapedEmails: { type: [String], default: [] },
    phone: String,
    painPoints: String,
    generatedSubject: String,
    generatedEmail: String,
    emailTone: { type: String, enum: ['professional', 'friendly', 'bold', 'concise'] },
    personalizedOpener: String,
    variants: { type: [variantSchema], default: [] },
    campaignName: String,
    score: { type: Number, default: 0, min: 0, max: 100 },
    tags: { type: [String], default: [] },
    followUpAt: Date,
    followUpNote: String,
    lastContactedAt: Date,
    activities: { type: [activitySchema], default: [] },
    sequence: { type: [sequenceStepSchema], default: [] },
    sequenceStartedAt: Date,
    status: { type: String, enum: ['new', 'researched', 'ready', 'sent', 'replied', 'converted', 'lost'], default: 'new' },
    notes: String,
    scrapedAt: Date,
    emailGeneratedAt: Date,
    sentAt: Date,
    repliedAt: Date,
  },
  { timestamps: true },
)

prospectSchema.index({ userId: 1, createdAt: -1 })
prospectSchema.index({ userId: 1, status: 1 })
prospectSchema.index({ userId: 1, campaignName: 1 })
prospectSchema.index({ userId: 1, score: -1 })
prospectSchema.index({ userId: 1, followUpAt: 1 })
prospectSchema.index({ sequenceStartedAt: 1, 'sequence.platform': 1, 'sequence.status': 1 })

export const Prospect = model<IProspect>('Prospect', prospectSchema)
