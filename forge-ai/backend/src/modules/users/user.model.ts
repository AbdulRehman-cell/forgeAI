import { Schema, model, Document } from 'mongoose'
import bcrypt from 'bcryptjs'


const dns = require("dns");

dns.setServers([
  "8.8.8.8",
  "8.8.4.4",
]);


export interface IUser extends Document {
  name: string
  email: string
  password?: string
  avatar?: string
  githubId?: string
  githubAccessToken?: string
  githubConnected: boolean
  aiProvider: 'openai' | 'claude' | 'gemini'
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
    aiProvider: { type: String, enum: ['openai', 'claude', 'gemini'], default: 'claude' },
  },
  { timestamps: true },
)

userSchema.pre('save', async function () {
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, 12)
  }
})

userSchema.methods.comparePassword = function (candidate: string) {
  return bcrypt.compare(candidate, this.password ?? '')
}

export const User = model<IUser>('User', userSchema)
