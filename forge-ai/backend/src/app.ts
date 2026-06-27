import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import passport from 'passport'

import { configurePassport } from './lib/passport'
import authRoutes from './modules/auth/auth.routes'
import repositoryRoutes from './modules/repository/repository.routes'
import githubRoutes from './modules/github/github.routes'
import aiRoutes from './modules/ai/ai.routes'
import taskRoutes from './modules/tasks/task.routes'
import settingsRoutes from './modules/settings/settings.routes'

const app = express()

// Security
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,
}))
app.use(rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false }))

// Parsing / logging
app.use(express.json({ limit: '10mb' }))
app.use(morgan('dev'))

// Passport
configurePassport()
app.use(passport.initialize())

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/repositories', repositoryRoutes)
app.use('/api/github', githubRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/tasks', taskRoutes)
app.use('/api/settings', settingsRoutes)

// Health
app.get('/health', (_, res) => res.json({ status: 'ok' }))

// 404
app.use((_, res) => res.status(404).json({ message: 'Route not found' }))

export default app
