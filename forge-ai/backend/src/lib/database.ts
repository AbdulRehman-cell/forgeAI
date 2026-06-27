import mongoose from 'mongoose'
import dns from 'dns'

dns.setServers([
  "8.8.8.8",
  "8.8.4.4",
]);


export async function connectDB() {
  const uri = process.env.MONGODB_URI ?? 'mongodb+srv://abdulrehmanishaque32_db_user:jb@cluster0.awr5zei.mongodb.net/chatdb?retryWrites=true&w=majority'
  await mongoose.connect(uri)
  console.log('[db] Connected to MongoDB')
}
