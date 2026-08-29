import { Schema, model, Document, Types } from 'mongoose'

export interface ITaskLog {
  level: 'info' | 'warn' | 'error'
  message: string
  timestamp: Date
}

export interface IFileChange {
  path: string
  before: string
  after: string
  additions: number
  deletions: number
  /** true when stored content was cut to fit the DB — revert must skip it */
  truncated?: boolean
}

export interface ITask extends Document {
  userId: Types.ObjectId
  repositoryId: Types.ObjectId
  type: 'fix_workspace' | 'fix_file' | 'fix_folder' | 'chat' | 'clone_repo' | 'review' | 'generate_tests' | 'security_scan' | 'blitz_deploy' | 'agent' | 'build_site' | 'build_dashboard'
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  logs: ITaskLog[]
  changes: IFileChange[]
  summary?: string
  error?: string
  jobId?: string
  metadata?: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

const taskSchema = new Schema<ITask>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    repositoryId: { type: Schema.Types.ObjectId, ref: 'Repository', required: true },
    type: { type: String, required: true },
    status: { type: String, enum: ['pending', 'running', 'completed', 'failed'], default: 'pending' },
    progress: { type: Number, default: 0 },
    logs: [
      {
        level: { type: String, enum: ['info', 'warn', 'error'] },
        message: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
    changes: [
      {
        path: String,
        before: String,
        after: String,
        additions: Number,
        deletions: Number,
        truncated: Boolean,
      },
    ],
    summary: String,
    error: String,
    jobId: String,
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
)

taskSchema.index({ userId: 1, createdAt: -1 })
taskSchema.index({ repositoryId: 1 })

export const Task = model<ITask>('Task', taskSchema)
