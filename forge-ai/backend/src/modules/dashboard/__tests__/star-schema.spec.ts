// Star-schema detection + auto-join spec — mirrors the shape of a real BI
// dump (fact + dim tables sharing _id columns).
// Run: npx ts-node src/modules/dashboard/__tests__/star-schema.spec.ts

import fs from 'fs'
import path from 'path'
import os from 'os'
import assert from 'assert'
import { UploadSource } from '../sources/upload'
import { detectAndJoinStarSchema } from '../sources/starSchema'
import { ingest } from '../ingest'

let passed = 0, failed = 0
async function it(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (err: any) { failed++; console.log(`  ✗ ${name}\n    ${err.message}`) }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'star-schema-'))
function stage(name: string) {
  const src = path.join(__dirname, 'fixtures', name)
  const dst = path.join(tmp, name)
  fs.copyFileSync(src, dst)
  return { uploadPath: dst, originalFilename: name, mimeType: 'text/csv' }
}
function tableFromFile(name: string) {
  const buf = fs.readFileSync(path.join(__dirname, 'fixtures', name))
  const t = ingest(buf, name, 'text/csv')
  return { name, headers: t.headers, rows: t.rows }
}

async function run() {
  console.log('\n─── detector ───')
  const tables = [
    tableFromFile('star-transactions.csv'),
    tableFromFile('star-customers.csv'),
    tableFromFile('star-products.csv'),
    tableFromFile('star-stores.csv'),
    tableFromFile('star-regions.csv'),
  ]
  const result = detectAndJoinStarSchema(tables)

  await it('detects a star schema when given fact + dims', () => {
    assert.strictEqual(result.detected, true, 'expected detection = true')
  })
  if (!result.detected) return

  await it('picks transactions as the fact table', () => {
    assert.strictEqual(result.plan.fact.name, 'star-transactions.csv')
  })

  await it('joins Customers, Products, Stores directly', () => {
    const joinedTargets = result.plan.joins.map((j) => j.toTable)
    for (const dim of ['star-customers.csv', 'star-products.csv', 'star-stores.csv']) {
      assert.ok(joinedTargets.includes(dim), `expected ${dim} joined`)
    }
  })

  await it('chains Stores→Regions via region_id (level 2 join)', () => {
    const chained = result.plan.joins.find((j) => j.toTable === 'star-regions.csv' && j.fromTable === 'star-stores.csv')
    assert.ok(chained, `expected Regions joined via Stores, got joins: ${JSON.stringify(result.plan.joins.map((j) => j.fromTable + '→' + j.toTable))}`)
  })

  await it('denormalized rows have fact columns AND dim columns', () => {
    const row = result.plan.denormalizedRows[0]
    assert.ok(row.transaction_id, 'missing fact column transaction_id')
    assert.ok(row.customer_name, `missing customer_name (denorm should have joined Customers): ${JSON.stringify(row)}`)
    assert.ok(row.product_name, 'missing product_name')
    assert.ok(row.store_name, 'missing store_name')
    // Level-2 chain — region_name comes from Regions via Stores
    assert.ok(row.region_name, `missing region_name from chained Stores→Regions: ${JSON.stringify(row)}`)
  })

  await it('LEFT JOIN preserves every fact row (no drops)', () => {
    assert.strictEqual(result.plan.denormalizedRows.length, 7, 'transactions had 7 rows; denorm should too')
  })

  await it('every FK row matched (customers/products/stores all have coverage)', () => {
    for (const j of result.plan.joins) {
      assert.ok(j.matched >= 1, `join ${j.fromTable}→${j.toTable} matched 0 rows`)
    }
  })

  console.log('\n─── end-to-end through UploadSource.fetch ───')
  const files = [
    stage('star-transactions.csv'),
    stage('star-customers.csv'),
    stage('star-products.csv'),
    stage('star-stores.csv'),
    stage('star-regions.csv'),
  ]
  const merged = await UploadSource.fetch({ files }, { userId: 'test', tokens: {} })
  await it('adapter returns a denormalized RawTable', () => {
    assert.strictEqual(merged.rows.length, 7)
    assert.ok(merged.headers.includes('customer_name'), 'expected customer_name in merged headers')
    assert.ok(merged.headers.includes('region_name'), 'expected region_name in merged headers')
    assert.match(merged.filename, /^star:/, `expected star: prefix in filename, got "${merged.filename}"`)
  })
  await it('surfaces join notes to the client', () => {
    assert.ok(merged.notes.some((n) => /Detected star schema/.test(n)), 'no star detection note')
    assert.ok(merged.notes.some((n) => /Joined.*matched/.test(n)), 'no per-join match report')
  })

  console.log('\n─── non-star fallback still errors ───')
  // Two files with no shared columns — should still fail with the diagnostic
  const q1 = stage('sales-q1.csv')
  const mismatched = stage('sales-mismatched.csv')
  await it('rejects when files share no id columns', async () => {
    try {
      await UploadSource.fetch({ files: [q1, mismatched] }, { userId: 'test', tokens: {} })
      throw new Error('expected error')
    } catch (err: any) {
      assert.match(err.message, /Cannot merge files/, `expected merge error, got: ${err.message}`)
    }
  })

  console.log(`\n${passed} passed, ${failed} failed\n`)
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(failed ? 1 : 0)
}

run().catch((e) => { console.error(e); process.exit(2) })
