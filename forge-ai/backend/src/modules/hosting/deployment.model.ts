import mongoose, { Document, Schema } from 'mongoose'

export interface IDeployment extends Document {
  slug: string
  userId: mongoose.Types.ObjectId
  repositoryId?: mongoose.Types.ObjectId
  siteName: string
  url: string
  siteDir: string
  backendDir?: string
  backendPort?: number
  envVars?: Record<string, string>
  customDomain?: string
  createdAt: Date
  updatedAt: Date
}

const DeploymentSchema = new Schema<IDeployment>(
  {
    slug:         { type: String, required: true, unique: true, index: true },
    userId:       { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    repositoryId: { type: Schema.Types.ObjectId, ref: 'Repository' },
    siteName:     { type: String, required: true },
    url:          { type: String, required: true },
    siteDir:      { type: String, required: true },
    backendDir:   { type: String },
    backendPort:  { type: Number },
    envVars:      { type: Map, of: String },
    customDomain: { type: String },
  },
  { timestamps: true },
)

export const Deployment = mongoose.model<IDeployment>('Deployment', DeploymentSchema)
