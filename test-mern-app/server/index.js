require('dotenv').config()
const express  = require('express')
const cors     = require('cors')
const mongoose = require('mongoose')

const app  = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

app.use('/api/notes', require('./routes/notes'))

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    mongoUri: process.env.MONGODB_URI ? 'set' : 'MISSING',
  })
})

// Start the HTTP server immediately so health checks pass while DB connects
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`))

// Connect to MongoDB with automatic retries — never exit the process
const MONGO_URI = process.env.MONGODB_URI ||
  'mongodb+srv://abdulrehmanishaque32_db_user:forge@cluster0.ejwhs2h.mongodb.net/forgeai_test'

async function connectWithRetry(attempt = 1) {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 })
    console.log('MongoDB connected')
  } catch (err) {
    console.error(`MongoDB attempt ${attempt} failed: ${err.message}`)
    const delay = Math.min(attempt * 3000, 30000)
    setTimeout(() => connectWithRetry(attempt + 1), delay)
  }
}

connectWithRetry()
