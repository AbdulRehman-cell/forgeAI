import { Schema, model, Document, Types } from 'mongoose'

export interface IRepository extends Document {
  userId: Types.ObjectId
  githubId: number
  name: string
  fullName: string
  description?: string
  language?: string
  private: boolean
  defaultBranch: string
  cloneUrl: string
  localPath?: string
  status: 'idle' | 'cloning' | 'indexing' | 'ready' | 'error'
  errorMessage?: string
  indexed: boolean
  fileCount?: number
  createdAt: Date
  updatedAt: Date
}

const repositorySchema = new Schema<IRepository>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    githubId: { type: Number, required: true },
    name: { type: String, required: true },
    fullName: { type: String, required: true },
    description: String,
    language: String,
    private: { type: Boolean, default: false },
    defaultBranch: { type: String, default: 'main' },
    cloneUrl: { type: String, required: true },
    localPath: String,
    status: { type: String, enum: ['idle', 'cloning', 'indexing', 'ready', 'error'], default: 'idle' },
    errorMessage: String,
    indexed: { type: Boolean, default: false },
    fileCount: Number,
  },
  { timestamps: true },
)

repositorySchema.index({ userId: 1 })
repositorySchema.index({ userId: 1, githubId: 1 }, { unique: true })

export const Repository = model<IRepository>('Repository', repositorySchema)
