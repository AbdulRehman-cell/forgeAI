import mongoose from 'mongoose'

export async function connectDB() {
  // Non-SRV connection string: Node's SRV/TXT resolver (c-ares) fails on this
  // machine's DNS setup, while plain hostname lookups work fine.
  const uri = process.env.MONGODB_URI ?? 'mongodb://abdulrehmanishaque32_db_user:jb@ac-9acbuce-shard-00-00.awr5zei.mongodb.net:27017,ac-9acbuce-shard-00-01.awr5zei.mongodb.net:27017,ac-9acbuce-shard-00-02.awr5zei.mongodb.net:27017/chatdb?ssl=true&replicaSet=atlas-cclqnn-shard-0&authSource=admin&retryWrites=true&w=majority'
  await mongoose.connect(uri)
  console.log('[db] Connected to MongoDB')
  await runStartupMigrations()
}

/**
 * One-shot cleanups Mongoose can't do itself. Mongoose creates schema-defined
 * indexes ADDITIVELY — it never drops or modifies an existing one when the
 * schema changes. So if we tighten a unique index (added partialFilterExpression,
 * switched from sparse), the OLD index keeps enforcing the old rule and
 * inserts collide. This runs after connect and drops indexes whose shape no
 * longer matches the current schema, so Mongoose recreates them fresh.
 */
async function runStartupMigrations() {
  const db = mongoose.connection.db
  if (!db) return

  // Drop stale indexes that block inserts. Mongoose only adds indexes, never
  // removes old ones when the schema changes, so we do it here at boot.
  const drops: Array<{ collection: string; index: string; reason: string }> = [
    {
      collection: 'repositories',
      index: 'userId_1_githubId_1',
      reason: 'replaced by partialFilterExpression version',
    },
    {
      collection: 'users',
      index: 'referralCode_1',
      reason: 'referralCode field removed from schema; unique null constraint blocks new users',
    },
  ]

  for (const { collection, index, reason } of drops) {
    try {
      const coll = db.collection(collection)
      const indexes = await coll.indexes()
      if (indexes.find((i) => i.name === index)) {
        await coll.dropIndex(index)
        console.log(`[db] Dropped stale index ${collection}.${index} — ${reason}`)
      }
    } catch (err: any) {
      console.warn(`[db] startup migration warning (${collection}.${index}):`, err?.message ?? err)
    }
  }
}
