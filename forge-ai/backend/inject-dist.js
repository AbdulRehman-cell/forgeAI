/**
 * Injects the pre-built client/dist/ into the MongoDB workspace zip for
 * the Mira SAAS property management site. Run from forge-ai/backend/:
 *   node ../../.claude/.../scratchpad/inject-dist.js
 */
const path = require('path')
const fs = require('fs')

// Load .env
require('dotenv').config({ path: path.resolve(__dirname, '.env') })

const AdmZip = require('adm-zip')
const { MongoClient, ObjectId } = require('mongodb')

const REPO_ID = '6adbb71cc8d1928a3cf7f473'
const DIST_DIR = 'C:/Users/Abdul Rehman/AppData/Local/Temp/mira-workspace/client/dist'

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI not set')

  const client = new MongoClient(uri)
  await client.connect()
  console.log('[inject-dist] Connected to MongoDB')

  const db = client.db()
  const col = db.collection('repositories')

  const doc = await col.findOne({ _id: new ObjectId(REPO_ID) }, { projection: { workspaceZip: 1 } })
  if (!doc?.workspaceZip) throw new Error('workspaceZip not found on document')

  const zipBuf = Buffer.isBuffer(doc.workspaceZip)
    ? doc.workspaceZip
    : Buffer.from(doc.workspaceZip.buffer)

  console.log(`[inject-dist] Downloaded zip: ${zipBuf.length} bytes`)

  const zip = new AdmZip(zipBuf)

  // Remove old dist files from zip to prevent bloat
  const existing = zip.getEntries().map(e => e.entryName)
  for (const entry of existing) {
    if (entry.startsWith('client/dist/')) {
      zip.deleteFile(entry)
    }
  }
  console.log('[inject-dist] Removed old dist entries from zip')

  // Walk local dist and add every file
  function addDir(localBase, zipBase) {
    const entries = fs.readdirSync(localBase, { withFileTypes: true })
    for (const e of entries) {
      const localPath = path.join(localBase, e.name)
      const zipPath = zipBase + '/' + e.name
      if (e.isDirectory()) {
        addDir(localPath, zipPath)
      } else {
        const content = fs.readFileSync(localPath)
        // Remove existing entry if present, then add fresh
        zip.deleteFile(zipPath)
        zip.addFile(zipPath, content)
        console.log(`  + ${zipPath} (${content.length} bytes)`)
      }
    }
  }

  addDir(DIST_DIR, 'client/dist')

  const newBuf = zip.toBuffer()
  console.log(`[inject-dist] New zip size: ${newBuf.length} bytes`)

  await col.updateOne(
    { _id: new ObjectId(REPO_ID) },
    { $set: { workspaceZip: newBuf } }
  )
  console.log('[inject-dist] MongoDB updated successfully')

  await client.close()
}

main().catch(err => { console.error(err); process.exit(1) })
