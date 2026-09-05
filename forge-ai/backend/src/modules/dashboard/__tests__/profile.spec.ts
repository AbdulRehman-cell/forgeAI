// Runnable spec — no external test runner. Uses Node's built-in `assert` and
// an `it()` helper so it stays dependency-free (backend has no jest/vitest
// installed). Run with: npx ts-node src/modules/dashboard/__tests__/profile.spec.ts
//
// This is the "messy CSV" test the constraints call out — every assertion
// pins one specific expected behavior from the profiler. Break the profiler,
// break the test.

import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { ingest } from '../ingest'
import { buildSchemaReport } from '../profile/schemaReport'
import { classifyCell } from '../profile/columnTypes'
import { detectNumber } from '../profile/currencyDetection'
import { detectDate } from '../profile/dateDetection'

let passed = 0
let failed = 0
function it(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (err: any) { failed++; console.log(`  ✗ ${name}\n    ${err.message}`) }
}

console.log('\n─── detectDate ───')
it('parses ISO', () => assert.strictEqual(detectDate('2024-03-14')?.format, 'iso'))
it('parses US slash MM/DD/YYYY', () => assert.strictEqual(detectDate('3/14/2024')?.format, 'us_slash'))
it('parses EU dot DD.MM.YYYY', () => assert.strictEqual(detectDate('15.03.2024')?.format, 'eu_dot'))
it('parses text month', () => assert.strictEqual(detectDate('Feb 3 2024')?.format, 'text_month'))
it('rejects a plain integer that looks like an ID', () => assert.strictEqual(detectDate('1001'), null))
it('rejects a nonsense date (Feb 30)', () => assert.strictEqual(detectDate('2024-02-30'), null))

console.log('\n─── detectNumber ───')
it('parses $1,234.56 as 1234.56 USD-symbol', () => {
  const n = detectNumber('$1,234.56')!
  assert.strictEqual(n.value, 1234.56)
  assert.strictEqual(n.currencySymbol, '$')
  assert.strictEqual(n.hasThousandsSeparator, true)
})
it('parses €980 as 980 with euro', () => {
  const n = detectNumber('€980')!
  assert.strictEqual(n.value, 980)
  assert.strictEqual(n.currencySymbol, '€')
})
it('parses parens as negative accounting', () => {
  const n = detectNumber('(500)')!
  assert.strictEqual(n.value, -500)
  assert.strictEqual(n.parensNegative, true)
})
it('parses ISO code prefix USD 3200', () => {
  const n = detectNumber('USD 3200')!
  assert.strictEqual(n.value, 3200)
  assert.strictEqual(n.currencySymbol, 'USD')
})
it('parses European "1.234,56" correctly', () => {
  const n = detectNumber('1.234,56')!
  assert.strictEqual(n.value, 1234.56)
})
it('returns null on non-numeric text', () => assert.strictEqual(detectNumber('Late shipment'), null))

console.log('\n─── classifyCell ───')
it('classifies blank as blank', () => assert.strictEqual(classifyCell('').type, 'blank'))
it('classifies "$1234" as currency', () => assert.strictEqual(classifyCell('$1234').type, 'currency'))
it('classifies "1234" as number', () => assert.strictEqual(classifyCell('1234').type, 'number'))
it('classifies "2024-03-14" as date', () => assert.strictEqual(classifyCell('2024-03-14').type, 'date'))
it('classifies "yes" as boolean', () => assert.strictEqual(classifyCell('yes').type, 'boolean'))
it('classifies "Acme Corp" as string', () => assert.strictEqual(classifyCell('Acme Corp').type, 'string'))

console.log('\n─── end-to-end profile on messy-sales.csv ───')
const csvPath = path.join(__dirname, 'fixtures', 'messy-sales.csv')
const table = ingest(fs.readFileSync(csvPath), 'messy-sales.csv', 'text/csv')
const report = buildSchemaReport(table)

const byName = Object.fromEntries(report.columns.map((c) => [c.name, c]))

it('identifies order_date as date', () => assert.strictEqual(byName['order_date'].detectedType, 'date'))
it('flags order_date mixed formats', () => {
  const dateFlags = byName['order_date'].flags
  assert.ok(dateFlags.some((f) => /Mixed date formats/i.test(f.message)), 'expected mixed-format flag')
})
it('identifies Total as currency', () => assert.strictEqual(byName['Total'].detectedType, 'currency'))
it('flags Total mixed currency symbols', () => {
  const flags = byName['Total'].flags
  assert.ok(flags.some((f) => /Mixed currency symbols/i.test(f.message)), 'expected mixed-currency flag')
})
it('identifies Qty as number (not currency)', () => assert.strictEqual(byName['Qty'].detectedType, 'number'))
it('identifies Region as category (low cardinality)', () => assert.strictEqual(byName['Region'].detectedType, 'category'))
it('identifies Order ID as string/id', () => {
  // Order ID column contains "1001" which parses as a number, but the ID metric
  // pass should still catch it via the name pattern.
  const idHit = report.idCandidates.find((c) => c.column === 'Order ID')
  assert.ok(idHit, `expected Order ID in idCandidates, got: ${JSON.stringify(report.idCandidates.map((c) => c.column))}`)
})
it('proposes Total as revenue metric candidate', () => {
  const rev = report.primaryMetricCandidates.find((m) => m.column === 'Total' && m.kind === 'revenue')
  assert.ok(rev, 'expected Total → revenue candidate')
})
it('matches snake_case discount_rate against rate/cost patterns (regression: \\b broken by _)', () => {
  // Rate wins over cost in the pattern list; either is acceptable, "unnamed count" is not.
  const hit = [...report.primaryMetricCandidates].find((m) => m.column === 'discount_rate')
  assert.ok(hit, 'expected a metric candidate for discount_rate')
  assert.notStrictEqual(hit!.kind, 'count', 'discount_rate should be recognized as rate or cost, not unnamed count')
})
it('proposes order_date as primary time axis', () => {
  assert.ok(report.primaryTimeAxisCandidate, 'expected a time axis candidate')
  assert.strictEqual(report.primaryTimeAxisCandidate!.column, 'order_date')
})
it('reports blank rows in order_date', () => {
  const blankFlag = byName['order_date'].flags.find((f) => /blank/i.test(f.message))
  assert.ok(blankFlag, 'expected blank-rows flag on order_date')
})
it('surfaces open questions', () => {
  assert.ok(report.openQuestions.length > 0, 'expected at least one open question')
})

console.log(`\n${passed} passed, ${failed} failed\n`)

// Also print the full report so a human can inspect it — this is the artifact
// the user asked to see.
console.log('═══════════ SCHEMA REPORT (messy-sales.csv) ═══════════')
console.log(JSON.stringify(report, null, 2))

process.exit(failed ? 1 : 0)
