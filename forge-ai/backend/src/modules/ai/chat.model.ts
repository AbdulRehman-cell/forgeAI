import { Schema, model, Document, Types } from 'mongoose'

export interface IChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface IChat extends Document {
  userId: Types.ObjectId
  repositoryId: Types.ObjectId
  messages: IChatMessage[]
  createdAt: Date
  updatedAt: Date
}

const chatSchema = new Schema<IChat>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    repositoryId: { type: Schema.Types.ObjectId, ref: 'Repository', required: true },

    messages: [
      {
        role: { type: String, enum: ['user', 'assistant'], required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
)

chatSchema.index({ userId: 1, repositoryId: 1 }, { unique: true })

export const Chat = model<IChat>('Chat', chatSchema)