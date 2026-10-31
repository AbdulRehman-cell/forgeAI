import { Schema, model, Document, Types } from 'mongoose'

/** One thread on the home page, in either mode. Build threads remember the
 *  client's answers and design choices until the build starts. */
export interface IConversation extends Document {
  userId: Types.ObjectId
  mode: 'build' | 'chat'
  title: string
  stack: 'static' | 'supabase'
  stage: 'questions' | 'design' | 'built'
  messages: { role: 'user' | 'assistant'; content: string; kind?: string; data?: any; at: Date }[]
  answers: Record<string, any>
  notes: string[]
  design: { hero?: string; color?: number; logo?: string }
  photos: string[]
  repositoryId?: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const conversationSchema = new Schema<IConversation>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    mode: { type: String, enum: ['build', 'chat'], required: true },
    title: { type: String, required: true },
    stack: { type: String, enum: ['static', 'supabase'], default: 'static' },
    stage: { type: String, enum: ['questions', 'design', 'built'], default: 'questions' },
    messages: [{
      role: { type: String, enum: ['user', 'assistant'], required: true },
      content: { type: String, default: '' },
      kind: String,
      data: Schema.Types.Mixed,
      at: { type: Date, default: Date.now },
    }],
    answers: { type: Schema.Types.Mixed, default: {} },
    notes: { type: [String], default: [] },
    design: { type: Schema.Types.Mixed, default: {} },
    photos: { type: [String], default: [] },
    repositoryId: { type: Schema.Types.ObjectId, ref: 'Repository' },
  },
  { timestamps: true, minimize: false },
)

conversationSchema.index({ userId: 1, updatedAt: -1 })

export const Conversation = model<IConversation>('Conversation', conversationSchema)
