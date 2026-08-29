import { Schema, model, Document, Types } from 'mongoose'

export interface IOutreachTemplate extends Document {
  userId: Types.ObjectId
  name: string
  subject: string
  body: string
  tone?: string
  industry?: string
  timesUsed: number
  lastUsedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const templateSchema = new Schema<IOutreachTemplate>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    tone: String,
    industry: String,
    timesUsed: { type: Number, default: 0 },
    lastUsedAt: Date,
  },
  { timestamps: true },
)

templateSchema.index({ userId: 1, createdAt: -1 })

export const OutreachTemplate = model<IOutreachTemplate>('OutreachTemplate', templateSchema)
