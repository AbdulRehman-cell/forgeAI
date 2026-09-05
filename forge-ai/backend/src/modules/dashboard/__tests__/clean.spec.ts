// Cleaning-stage spec — messy CSV in, structured changelog + normalized rows out.
// Run: npx ts-node src/modules/dashboard/__tests__/clean.spec.ts

import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { ingest } from '../ingest'
import { buildSchemaReport } from '../profile/schemaReport'
import { cleanTable } from '../clean'

let passed = 0, failed = 0
function it(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (err: any) { failed++; console.log(`  ✗ ${name}\n    ${err.message}`) }
}

const csvPath = path.join(__dirname, 'fixtures', 'messy-sales.csv')
const table = ingest(fs.readFileSync(csvPath), 'messy-sales.csv', 'text/csv')
const schema = buildSchemaReport(table)

console.log('\n─── cleanTable (no config) ───')
{
  const r = cleanTable(table, schema)

  it('normalizes every parseable date to ISO', () => {
    for (const row of r.cleanedRows) {
      const d = row['order_date']
      if (d !== null) assert.match(String(d), /^\d{4}-\d{2}-\d{2}$/, `bad date: ${d}`)
    }
  })

  it('coerces Total to numbers (or null)', () => {
    for (const row of r.cleanedRows) {
      const t = row['Total']
      if (t !== null) assert.strictEqual(typeof t, 'number', `Total not numeric: ${t}`)
    }
  })

  it('removes the duplicate row (1001 appears twice in fixture)', () => {
    assert.ok(r.stats.duplicatesRemoved >= 1, `expected duplicates removed, got ${r.stats.duplicatesRemoved}`)
    const dup = r.changelog.find((c) => c.kind === 'duplicate_removed')
    assert.ok(dup, 'expected a duplicate_removed changelog entry')
  })

  it('keeps null date + null Qty (not silently dropped)', () => {
    const rowWithBlankDate = r.cleanedRows.find((row) => row['order_date'] === null)
    assert.ok(rowWithBlankDate, 'expected row with null date preserved')
    const rowWithBlankQty = r.cleanedRows.find((row) => row['Qty'] === null)
    assert.ok(rowWithBlankQty, 'expected row with null Qty preserved')
  })

  it('emits an ERROR-severity changelog entry for mixed currency', () => {
    const err = r.changelog.find((c) => c.kind === 'currency_mixed_unresolved')
    assert.ok(err, 'expected currency_mixed_unresolved entry')
    assert.strictEqual(err!.severity, 'error')
    assert.match(err!.message, /MIXED currency/)
  })

  it('collapses Region case variants (us-east/US-EAST/US-East → one canonical form)', () => {
    const regions = new Set(r.cleanedRows.map((row) => row['Region']))
    // Should be at most 3 distinct after normalization: us-east (all 3 variants collapse), eu-west, APAC
    assert.ok(regions.size <= 3, `expected ≤3 Region values after normalization, got ${regions.size}: ${[...regions].join(', ')}`)
    const cat = r.changelog.find((c) => c.kind === 'category_normalized')
    assert.ok(cat, 'expected category_normalized changelog entry')
  })

  it('records a currency decision for Total (unresolved because $ is ambiguous)', () => {
    const dec = r.currencyDecisions.find((d) => d.column === 'Total')
    assert.ok(dec, 'expected currency decision for Total')
    assert.strictEqual(dec!.source, 'majority_symbol', `expected majority_symbol source, got ${dec!.source}`)
  })

  it('exposes null_kept entries for columns with any nulls', () => {
    const kept = r.changelog.filter((c) => c.kind === 'null_kept')
    assert.ok(kept.length >= 2, `expected null_kept entries for at least 2 cols, got ${kept.length}`)
  })

  it('provides a human-readable changelog', () => {
    assert.ok(r.humanChangelog.length > 0, 'humanChangelog is empty')
    for (const line of r.humanChangelog) assert.match(line, /^• /, `bad bullet: "${line}"`)
  })
}

console.log('\n─── cleanTable with currencyOverrides ───')
{
  const r = cleanTable(table, schema, { currencyOverrides: { Total: 'USD' } })
  it('records config-sourced currency decision', () => {
    const dec = r.currencyDecisions.find((d) => d.column === 'Total')
    assert.strictEqual(dec!.source, 'config')
    assert.strictEqual(dec!.resolvedIso, 'USD')
  })
  it('replaces the mixed-currency error with an info-level normalized entry', () => {
    const err = r.changelog.find((c) => c.kind === 'currency_mixed_unresolved')
    assert.strictEqual(err, undefined, 'mixed-currency error should be gone once override is provided')
    const ok = r.changelog.find((c) => c.kind === 'currency_normalized' && c.column === 'Total')
    assert.ok(ok, 'expected currency_normalized entry from config override')
  })
}

console.log('\n─── cleanTable with nullStrategy=zero on Qty ───')
{
  const r = cleanTable(table, schema, { nullStrategy: { Qty: { kind: 'zero' } } })
  it('fills Qty nulls with 0', () => {
    const anyNullQty = r.cleanedRows.some((row) => row['Qty'] === null)
    assert.strictEqual(anyNullQty, false, 'expected all Qty null to be filled with 0')
  })
  it('emits null_filled entry', () => {
    const filled = r.changelog.find((c) => c.kind === 'null_filled' && c.column === 'Qty')
    assert.ok(filled, 'expected null_filled entry for Qty')
  })
}

console.log('\n─── cleanTable with dedupe: false ───')
{
  const r = cleanTable(table, schema, { dedupe: false })
  it('keeps the duplicate row', () => {
    assert.strictEqual(r.stats.duplicatesRemoved, 0)
    assert.strictEqual(r.stats.rowsOut, r.stats.rowsIn)
  })
}

console.log(`\n${passed} passed, ${failed} failed\n`)

// Show the full cleaning result on the messy CSV so a human can inspect it
const showcase = cleanTable(table, schema, {
  currencyOverrides: { Total: 'USD' },
  nullStrategy: { Qty: { kind: 'zero' } },
})
console.log('═══════════ CLEANING RESULT (messy-sales.csv, with USD override + Qty→0) ═══════════')
console.log('\nStats:', showcase.stats)
console.log('\nCurrency decisions:', showcase.currencyDecisions)
console.log('\nHuman changelog:')
for (const line of showcase.humanChangelog) console.log(' ', line)
console.log('\nStructured changelog:')
console.log(JSON.stringify(showcase.changelog, null, 2))
console.log('\nFirst 5 cleaned rows:')
console.log(JSON.stringify(showcase.cleanedRows.slice(0, 5), null, 2))

process.exit(failed ? 1 : 0)
