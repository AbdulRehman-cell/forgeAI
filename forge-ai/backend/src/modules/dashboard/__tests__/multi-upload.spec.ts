// Multi-file upload — same-schema concat, header-mismatch rejection.
// Run: npx ts-node src/modules/dashboard/__tests__/multi-upload.spec.ts

import fs from 'fs'
import path from 'path'
import os from 'os'
import assert from 'assert'
import { UploadSource } from '../sources/upload'

let passed = 0, failed = 0
async function it(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (err: any) { failed++; console.log(`  ✗ ${name}\n    ${err.message}`) }
}

// Copy fixtures to a temp dir so uploadPath points at real disk locations
// exactly the way the processor stages them.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-upload-'))
function stage(name: string): { uploadPath: string; originalFilename: string; mimeType: string } {
  const src = path.join(__dirname, 'fixtures', name)
  const dst = path.join(tmp, name)
  fs.copyFileSync(src, dst)
  return { uploadPath: dst, originalFilename: name, mimeType: 'text/csv' }
}

async function run() {
  const q1 = stage('sales-q1.csv')
  const q2 = stage('sales-q2.csv')
  const mismatched = stage('sales-mismatched.csv')

  console.log('\n─── single file (legacy shape) ───')
  await it('parses one file via legacy uploadPath field', async () => {
    const t = await UploadSource.fetch({ uploadPath: q1.uploadPath, originalFilename: q1.originalFilename, mimeType: q1.mimeType }, { userId: 'test', tokens: {} })
    assert.strictEqual(t.rows.length, 3, `expected 3 rows, got ${t.rows.length}`)
    assert.ok(!t.headers.includes('_source_file'), 'single-file merge should not add source marker')
  })

  console.log('\n─── multi-file merge ───')
  const merged = await UploadSource.fetch({ files: [q1, q2] }, { userId: 'test', tokens: {} })
  await it('concatenates rows from both files', () => {
    assert.strictEqual(merged.rows.length, 5, `expected 5 rows (3+2), got ${merged.rows.length}`)
  })
  await it('adds _source_file marker column', () => {
    assert.ok(merged.headers.includes('_source_file'), 'missing _source_file header')
    const filenames = new Set(merged.rows.map((r) => r._source_file))
    assert.strictEqual(filenames.size, 2, `expected 2 distinct source files, got ${filenames.size}`)
    assert.ok(filenames.has('sales-q1.csv') && filenames.has('sales-q2.csv'), 'source filenames wrong')
  })
  await it('reports per-file breakdown in notes', () => {
    // Pre-merge path now handles same-schema files earlier and emits a
    // different (equally informative) note. Accept either wording.
    const noteExists = merged.notes.some((n) =>
      (/Pre-merged \d+ same-schema files/.test(n) && n.includes('sales-q1.csv') && n.includes('sales-q2.csv')) ||
      (/Merged \d+ files/.test(n) && n.includes('sales-q1.csv (3 rows)') && n.includes('sales-q2.csv (2 rows)')),
    )
    assert.ok(noteExists, `expected merge summary note, got: ${merged.notes.join(' | ')}`)
  })
  await it('preserves data integrity: Q1 rows still have Q1 order ids', () => {
    const q1Rows = merged.rows.filter((r) => r._source_file === 'sales-q1.csv')
    assert.ok(q1Rows.every((r) => Number(r['Order ID']) >= 3001 && Number(r['Order ID']) <= 3003), 'Q1 order ids wrong')
  })

  console.log('\n─── header-mismatch rejection ───')
  await it('throws a diff error when files have different columns', async () => {
    try {
      await UploadSource.fetch({ files: [q1, mismatched] }, { userId: 'test', tokens: {} })
      throw new Error('expected an error')
    } catch (err: any) {
      assert.match(err.message, /Cannot merge files/, `expected merge-fail error, got: ${err.message}`)
      assert.match(err.message, /column sets differ/, 'error should say column sets differ')
      assert.match(err.message, /Qty/, 'error should mention missing "Qty" column')
      assert.match(err.message, /Extra Column/, 'error should mention "Extra Column" as extra')
    }
  })

  console.log('\n─── column order tolerance ───')
  // Same headers, different order — should still merge
  const reordered = stage('sales-q1.csv') // reuse same file (order matches)
  await it('order doesnt matter (set comparison)', async () => {
    const t = await UploadSource.fetch({ files: [q1, reordered] }, { userId: 'test', tokens: {} })
    assert.strictEqual(t.rows.length, 6, `expected 6 rows (3+3), got ${t.rows.length}`)
  })

  console.log(`\n${passed} passed, ${failed} failed\n`)
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(failed ? 1 : 0)
}

run().catch((e) => { console.error(e); process.exit(2) })
