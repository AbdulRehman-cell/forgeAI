// Metrics spec — assertions on the aggregated numbers from messy-sales.csv.
// LLM summary is skipped so this stays deterministic and offline.
// Run: npx ts-node src/modules/dashboard/__tests__/metrics.spec.ts

import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { ingest } from '../ingest'
import { buildSchemaReport } from '../profile/schemaReport'
import { cleanTable } from '../clean'
import { computeMetrics } from '../metrics'

let passed = 0, failed = 0
function it(name: string, fn: () => void | Promise<void>) {
  const p = Promise.resolve().then(fn)
  return p.then(() => { passed++; console.log(`  ✓ ${name}`) })
    .catch((err: any) => { failed++; console.log(`  ✗ ${name}\n    ${err.message}`) })
}

async function run() {
  const csvPath = path.join(__dirname, 'fixtures', 'messy-sales.csv')
  const table = ingest(fs.readFileSync(csvPath), 'messy-sales.csv', 'text/csv')
  const schema = buildSchemaReport(table)

  console.log('\n─── computeMetrics with USD override + Qty=0 + no LLM ───')
  const cleaning = cleanTable(table, schema, {
    currencyOverrides: { Total: 'USD' },
    nullStrategy: { Qty: { kind: 'zero' } },
  })
  const result = await computeMetrics(schema, cleaning, null, { skipSummary: true })

  await it('picks a Total-of-Total metric (revenue sum)', () => {
    const m = result.metrics.find((x) => x.spec.id === 'total_Total')
    assert.ok(m, `expected total_Total in specs, got ${result.specs.map((s) => s.id).join(', ')}`)
    assert.ok(m!.value, 'expected value populated')
    assert.strictEqual(m!.value!.kind, 'total')
    // Sum of 10 kept rows (post-dedup): 1234.56 + 980 + 1450 + 78 + 3200 + 2400 + (-500) + 450 + 2340 + 1875 = 13507.56
    assert.strictEqual((m!.value as any).value, 13507.56)
  })

  await it('picks a time chart (timeseries OR multi_series) with a real bucket', () => {
    // With multiple numeric columns available (Total, Qty, discount_rate),
    // the picker now prefers multi_series over a single timeseries.
    const m = result.metrics.find((x) => x.spec.kind === 'timeseries' || x.spec.kind === 'multi_series')
    assert.ok(m, 'expected a time-chart metric')
    assert.ok(m!.value, 'expected value populated')
    assert.ok(['day', 'week', 'month'].includes((m!.value as any).bucket))
  })

  await it('growth_rate computed with current + previous buckets', () => {
    const m = result.metrics.find((x) => x.spec.kind === 'growth_rate')
    assert.ok(m, 'expected a growth_rate metric')
    assert.ok(m!.value, 'expected value')
    const v = m!.value as any
    assert.ok(typeof v.current === 'number' && typeof v.previous === 'number', 'current/previous missing')
    assert.ok(v.rate === null || typeof v.rate === 'number', 'rate must be null or number')
  })

  await it('produces a Region breakdown (donut for primary category)', () => {
    // With enhanced picker, first category → donut; secondary categories → top_n
    const m = result.metrics.find((x) => (x.spec.kind === 'donut' || x.spec.kind === 'top_n') && x.spec.groupColumn === 'Region')
    assert.ok(m, 'expected Region breakdown metric')
    const v = m!.value as any
    assert.ok(v && (v.kind === 'donut' || v.kind === 'top_n'), 'expected donut or top_n value')
    assert.ok(v.entries.length <= 5 && v.entries.length >= 1, `entries length ${v.entries.length}`)
    const sum = v.entries.reduce((s: number, e: any) => s + e.pctOfTotal, 0)
    if (v.other === null) assert.ok(Math.abs(sum - 1) < 1e-9, `entries pct should sum to 1, got ${sum}`)
  })

  await it('summary is null (skipped)', () => {
    assert.strictEqual(result.summary.text, null)
    assert.ok(result.summary.error, 'expected an error/reason field')
  })

  console.log('\n─── computeMetrics WITHOUT USD override — Total should be skipped ───')
  const cleaningNoOverride = cleanTable(table, schema)
  const r2 = await computeMetrics(schema, cleaningNoOverride, null, { skipSummary: true })
  await it('mixed-currency Total is refused, listed in skipped[]', () => {
    const skipped = r2.skipped.find((s) => s.column === 'Total')
    assert.ok(skipped, `expected Total in skipped[], got ${JSON.stringify(r2.skipped)}`)
    const specs = r2.specs.map((s) => s.id)
    assert.ok(!specs.includes('total_Total'), 'total_Total should NOT be in specs when currency is unresolved')
  })

  console.log('\n─── config: exclude a metric, include a custom one ───')
  const r3 = await computeMetrics(schema, cleaning, null, {
    skipSummary: true,
    exclude: ['total_Total'],
    include: [{
      id: 'custom_qty_total', kind: 'total', valueColumn: 'Qty',
      label: 'Custom: total Qty', reasoning: 'test override',
    }],
  })
  await it('exclude removes the excluded metric', () => {
    assert.ok(!r3.specs.find((s) => s.id === 'total_Total'), 'total_Total should be excluded')
  })
  await it('include adds the custom metric with a computed value', () => {
    const m = r3.metrics.find((x) => x.spec.id === 'custom_qty_total')
    assert.ok(m && m.value && m.value.kind === 'total', 'expected custom_qty_total computed')
  })

  console.log('\n─── config: timeBucket override forces monthly buckets ───')
  const r4 = await computeMetrics(schema, cleaning, null, { skipSummary: true, timeBucket: 'month' })
  await it('honors timeBucket=month', () => {
    const m = r4.metrics.find((x) => x.spec.kind === 'timeseries' || x.spec.kind === 'multi_series')
    if (!m || !m.value) throw new Error('no time chart')
    const v = m.value as any
    assert.strictEqual(v.bucket, 'month')
    // Every bucket key should be a first-of-month
    const points = v.kind === 'timeseries' ? v.series : v.series[0].points
    for (const p of points) assert.match(p.bucket, /^\d{4}-\d{2}-01$/)
  })

  console.log(`\n${passed} passed, ${failed} failed\n`)

  // Show the full metrics result so a human can inspect the shape
  console.log('═══════════ METRICS RESULT (messy-sales.csv, USD + Qty→0, no LLM) ═══════════')
  console.log(JSON.stringify(result, null, 2))

  process.exit(failed ? 1 : 0)
}
run()
