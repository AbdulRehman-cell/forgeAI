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
  try {
    const coll = mongoose.connection.db?.collection('repositories')
    if (!coll) return
    const indexes = await coll.indexes()
    const stale = indexes.find(
      (i) =>
        i.name === 'userId_1_githubId_1' &&
        // The current schema uses partialFilterExpression; anything without it
        // (sparse, or nothing) is from a previous schema version.
        !i.partialFilterExpression,
    )
    if (stale) {
      await coll.dropIndex('userId_1_githubId_1')
      console.log('[db] Dropped stale index repositories.userId_1_githubId_1 — Mongoose will rebuild it with the current definition.')
    }
  } catch (err: any) {
    // Non-fatal — a missing index or a race with another instance shouldn't
    // block boot. Mongoose's own createIndexes step will report the real error
    // if the current definition also fails.
    console.warn('[db] startup migration warning:', err?.message ?? err)
  }
}
