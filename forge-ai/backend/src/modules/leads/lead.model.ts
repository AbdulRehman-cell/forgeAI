import { Schema, model, Document, Types } from 'mongoose'

export type LeadStatus = 'new' | 'qualified' | 'contacted' | 'proposal' | 'converted' | 'lost'
export type LeadPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface ILeadActivity {
  type: 'note' | 'call' | 'email' | 'meeting' | 'status_change'
  body: string
  createdAt: Date
}

export interface ILead extends Document {
  siteRepositoryId: Types.ObjectId
  ownerId: Types.ObjectId
  name: string
  /** Booking forms often ask for a phone number only */
  email?: string
  phone?: string
  message?: string
  source?: string
  read: boolean
  status: LeadStatus
  priority: LeadPriority
  score: number
  tags: string[]
  dealValue?: number
  company?: string
  jobTitle?: string
  notes?: string
  followUpAt?: Date
  followUpNote?: string
  activities: ILeadActivity[]
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  createdAt: Date
  updatedAt: Date
}

const activitySchema = new Schema<ILeadActivity>(
  {
    type: { type: String, enum: ['note', 'call', 'email', 'meeting', 'status_change'], required: true },
    body: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

const leadSchema = new Schema<ILead>(
  {
    siteRepositoryId: { type: Schema.Types.ObjectId, ref: 'Repository', required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    email: { type: String, lowercase: true },
    phone: String,
    message: String,
    source: String,
    read: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['new', 'qualified', 'contacted', 'proposal', 'converted', 'lost'],
      default: 'new',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    score: { type: Number, default: 0, min: 0, max: 100 },
    tags: [{ type: String }],
    dealValue: Number,
    company: String,
    jobTitle: String,
    notes: String,
    followUpAt: Date,
    followUpNote: String,
    activities: [activitySchema],
    utmSource: String,
    utmMedium: String,
    utmCampaign: String,
  },
  { timestamps: true },
)

leadSchema.index({ ownerId: 1, createdAt: -1 })
leadSchema.index({ ownerId: 1, status: 1 })
leadSchema.index({ ownerId: 1, score: -1 })
leadSchema.index({ ownerId: 1, followUpAt: 1 })
leadSchema.index({ siteRepositoryId: 1 })

export const Lead = model<ILead>('Lead', leadSchema)
