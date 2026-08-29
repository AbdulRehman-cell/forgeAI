// End-to-end spec for a realistic BI dataset shape:
// multi-year fact tables + split dimension files + secondary fact (returns).
// Mirrors what a real client uploads (Adventure Works / Contoso style).
// Run: npx ts-node src/modules/dashboard/__tests__/big-dataset.spec.ts

import fs from 'fs'
import path from 'path'
import os from 'os'
import assert from 'assert'
import { UploadSource } from '../sources/upload'
import { buildSchemaReport } from '../profile/schemaReport'
import { cleanTable } from '../clean'
import { computeMetrics } from '../metrics'

let passed = 0, failed = 0
async function it(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (err: any) { failed++; console.log(`  ✗ ${name}\n    ${err.message}`) }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'big-dataset-'))
function stage(name: string) {
  const src = path.join(__dirname, 'fixtures', name)
  const dst = path.join(tmp, name)
  fs.copyFileSync(src, dst)
  return { uploadPath: dst, originalFilename: name, mimeType: 'text/csv' }
}

async function run() {
  const files = [
    stage('big-transactions-1997.csv'),
    stage('big-transactions-1998.csv'),
    stage('big-customers-a.csv'),
    stage('big-customers-b.csv'),
    stage('big-products.csv'),
    stage('big-stores.csv'),
    stage('big-regions.csv'),
    stage('big-returns.csv'),
  ]

  console.log('\n─── Step 1: adapter joins everything ───')
  const table = await UploadSource.fetch({ files }, { userId: 'test', tokens: {} })

  await it('pre-merges same-schema files (1997 + 1998 → one Transactions)', () => {
    const preMergeNote = table.notes.find((n) => /Pre-merged.*same-schema/.test(n) && n.includes('big-transactions-1997.csv') && n.includes('big-transactions-1998.csv'))
    assert.ok(preMergeNote, `expected pre-merge note for transactions, got: ${table.notes.join(' | ')}`)
  })
  await it('pre-merges Customers files (a + b)', () => {
    const preMergeNote = table.notes.find((n) => /Pre-merged.*same-schema/.test(n) && n.includes('big-customers-a.csv') && n.includes('big-customers-b.csv'))
    assert.ok(preMergeNote, `expected pre-merge note for customers, got: ${table.notes.join(' | ')}`)
  })
  await it('detects star with the combined transactions as fact', () => {
    assert.ok(table.notes.some((n) => /Detected star schema/.test(n) && /big-transactions-1997.csv \+ big-transactions-1998.csv/.test(n)), `expected star-schema detection on merged transactions, got: ${table.notes.join(' | ')}`)
  })
  await it('joins Customers, Products, Stores directly to fact', () => {
    const joinCount = table.notes.filter((n) => /Joined ".*" on /.test(n)).length
    assert.ok(joinCount >= 3, `expected ≥3 direct joins (customers/products/stores), got ${joinCount}`)
  })
  await it('chains Regions in via Stores.region_id', () => {
    assert.ok(table.notes.some((n) => /Joined "big-regions.csv"/.test(n) && n.includes('region_id')), `expected Regions chained via Stores, got: ${table.notes.join(' | ')}`)
  })
  await it('computes cross-fact aggregate for Returns (no shared PK)', () => {
    assert.ok(table.notes.some((n) => /Cross-fact aggregate/.test(n) && /big-returns/.test(n)), `expected cross-fact aggregate note, got: ${table.notes.join(' | ')}`)
  })

  console.log('\n─── Step 2: denormalized row shape ───')
  await it('has 8 fact rows (5 from 1997 + 3 from 1998)', () => {
    assert.strictEqual(table.rows.length, 8)
  })
  await it('row includes joined dim columns (product_name, customer_country, region_name)', () => {
    const r = table.rows[0]
    assert.ok(r.product_name, 'missing product_name from Products join')
    assert.ok(r.customer_country, 'missing customer_country from Customers join')
    // Regions has sales_region, not region_name
    assert.ok(r.sales_region, `missing sales_region from Regions chain, got keys: ${Object.keys(r).join(', ')}`)
  })
  await it('has scalar broadcast columns for returns ratio', () => {
    const r = table.rows[0]
    assert.ok('big_returns_quantity_rate_scalar' in r, `expected returns rate scalar column, got: ${Object.keys(r).join(', ')}`)
    assert.ok('big_returns_quantity_scalar' in r, `expected returns total scalar column, got: ${Object.keys(r).join(', ')}`)
  })

  console.log('\n─── Step 3: profile + clean + metrics end-to-end ───')
  const schema = buildSchemaReport(table)
  const cleaning = cleanTable(table, schema)
  await it('derives revenue = product_retail_price × quantity', () => {
    assert.ok(cleaning.derivedColumns.some((d) => d.name === 'revenue'), `expected derived revenue, got: ${cleaning.derivedColumns.map((d) => d.name).join(', ')}`)
  })
  await it('derives cost_total + profit', () => {
    assert.ok(cleaning.derivedColumns.some((d) => d.name === 'cost_total'), 'missing cost_total')
    assert.ok(cleaning.derivedColumns.some((d) => d.name === 'profit'), 'missing profit')
  })

  const metrics = await computeMetrics(schema, cleaning, null, { skipSummary: true })
  await it('picker emits scalar-based ratio KPI for returns', () => {
    const hit = metrics.metrics.find((m) => /rate_scalar$/.test(m.spec.valueColumn ?? ''))
    assert.ok(hit, `expected a rate_scalar KPI, got metric ids: ${metrics.specs.map((s) => s.id).join(', ')}`)
    assert.ok(hit!.value && (hit!.value as any).value !== undefined, 'expected value populated')
    // Total transactions qty = 3+1+2+5+4+10+7+3 = 35. Total returns qty = 1+1+2 = 4. Rate ≈ 0.114
    const val = (hit!.value as any).value
    assert.ok(Math.abs(val - 4/35) < 0.001, `expected rate ≈ ${(4/35).toFixed(4)}, got ${val}`)
  })
  await it('picker emits Revenue total from derived column', () => {
    const revTotal = metrics.metrics.find((m) => m.spec.id === 'total_revenue' || (m.spec.valueColumn === 'revenue' && m.spec.kind === 'total'))
    assert.ok(revTotal, `expected total_revenue metric, got: ${metrics.specs.map((s) => s.id).join(', ')}`)
    // Revenue = SUM(price × qty) for each row
    // 1997 rows: 3*19.99 + 1*24.99 + 2*19.99 + 5*89 + 4*24.99 = 59.97 + 24.99 + 39.98 + 445 + 99.96 = 669.90
    // 1998 rows: 10*19.99 + 7*89 + 3*24.99 = 199.90 + 623 + 74.97 = 897.87
    // Total = 1567.77
    const val = (revTotal!.value as any).value
    assert.ok(Math.abs(val - 1567.77) < 0.01, `expected revenue = 1567.77, got ${val}`)
  })
  await it('picker emits Profit total from derived column', () => {
    const profitTotal = metrics.metrics.find((m) => m.spec.valueColumn === 'profit' && m.spec.kind === 'total')
    assert.ok(profitTotal, 'expected profit total')
  })

  console.log(`\n${passed} passed, ${failed} failed\n`)
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(failed ? 1 : 0)
}

run().catch((e) => { console.error(e); process.exit(2) })
