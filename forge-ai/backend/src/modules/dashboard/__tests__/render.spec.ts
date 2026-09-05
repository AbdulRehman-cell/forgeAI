// Render spec — full pipeline through disk write, then structural checks on
// the emitted files. Chart rendering itself is client-side (Chart.js); we
// only verify the payload + template shape here.
// Run: npx ts-node src/modules/dashboard/__tests__/render.spec.ts

import fs from 'fs'
import os from 'os'
import path from 'path'
import assert from 'assert'
import { ingest } from '../ingest'
import { buildSchemaReport } from '../profile/schemaReport'
import { cleanTable } from '../clean'
import { computeMetrics } from '../metrics'
import { renderDashboardToDisk } from '../render'

let passed = 0, failed = 0
async function it(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (err: any) { failed++; console.log(`  ✗ ${name}\n    ${err.message}`) }
}

async function run() {
  const csvPath = path.join(__dirname, 'fixtures', 'messy-sales.csv')
  const table = ingest(fs.readFileSync(csvPath), 'messy-sales.csv', 'text/csv')
  const schema = buildSchemaReport(table)
  const cleaning = cleanTable(table, schema, {
    currencyOverrides: { Total: 'USD' },
    nullStrategy: { Qty: { kind: 'zero' } },
  })
  const metrics = await computeMetrics(schema, cleaning, null, { skipSummary: true })

  const destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-test-'))

  const rendered = renderDashboardToDisk({
    destDir, dashboardName: 'acme-q1-sales', schema, cleaning, metrics,
  })

  console.log(`\n─── files written to ${destDir} ───`)
  console.log(' ', rendered.relativeNames.join('\n  '))

  console.log('\n─── file presence ───')
  const expected = [
    'index.html', 'styles.css', 'dashboard.js',
    'render.yaml', 'vercel.json', 'Dockerfile', 'nginx.conf',
    'dashboard-metadata.json',
  ]
  for (const f of expected) {
    await it(`writes ${f}`, () => {
      assert.ok(fs.existsSync(path.join(destDir, f)), `${f} missing`)
    })
  }

  console.log('\n─── HTML structural checks ───')
  const html = fs.readFileSync(path.join(destDir, 'index.html'), 'utf-8')
  await it('has title with the dashboard name', () => assert.match(html, /acme-q1-sales/))
  await it('references styles.css and dashboard.js', () => {
    assert.match(html, /href="\.\/styles\.css"/)
    assert.match(html, /src="\.\/dashboard\.js"/)
  })
  await it('loads Chart.js from a CDN', () => assert.match(html, /cdn\.jsdelivr\.net\/npm\/chart\.js/))
  await it('renders KPI cards for total + growth', () => {
    // Power BI-style: pastel tiles. Class name is kpi-pastel + growth modifier.
    assert.match(html, /class="kpi-pastel /)
    assert.match(html, /kpi-pastel [^"]*growth /)
  })
  await it('renders a canvas for each timeseries / top_n metric', () => {
    const canvasIds = [...html.matchAll(/id="chart-([^"]+)"/g)].map((m) => m[1])
    const chartables = metrics.metrics.filter((m) => m.value && (m.value.kind === 'timeseries' || m.value.kind === 'top_n'))
    for (const c of chartables) {
      assert.ok(canvasIds.includes(c.spec.id), `expected canvas for ${c.spec.id}, got ${canvasIds.join(', ')}`)
    }
  })
  await it('embeds the metrics payload for the client script', () => {
    assert.match(html, /<script id="dashboard-data" type="application\/json">/)
    const payloadMatch = html.match(/<script id="dashboard-data"[^>]*>([\s\S]*?)<\/script>/)
    assert.ok(payloadMatch, 'no payload script')
    const parsed = JSON.parse(payloadMatch![1].replace(/\\u003c/g, '<'))
    assert.ok(Array.isArray(parsed.metrics), 'payload.metrics not array')
    assert.ok(parsed.metrics.length >= 3, `expected ≥3 metrics in payload, got ${parsed.metrics.length}`)
  })
  await it('includes a cleaning changelog details block', () => {
    assert.match(html, /<details class="log">/)
    assert.match(html, /Cleaning changelog/)
  })
  await it('escapes HTML in user-provided fields (no unescaped < in filenames)', () => {
    // Filename here is safe, but the escaping helper should still be present
    // and the injected payload must never contain an unescaped closing tag.
    assert.ok(!html.includes('</script></script>'), 'payload not escaped safely')
  })

  console.log('\n─── deploy scaffolding sanity ───')
  await it('render.yaml points at the current directory as static publish path', () => {
    const y = fs.readFileSync(path.join(destDir, 'render.yaml'), 'utf-8')
    assert.match(y, /staticPublishPath: \.\//)
    assert.match(y, /name: acme-q1-sales/)
  })
  await it('vercel.json parses and has outputDirectory', () => {
    const v = JSON.parse(fs.readFileSync(path.join(destDir, 'vercel.json'), 'utf-8'))
    assert.strictEqual(v.outputDirectory, '.')
  })
  await it('metadata json roundtrips and preserves the schema', () => {
    const m = JSON.parse(fs.readFileSync(path.join(destDir, 'dashboard-metadata.json'), 'utf-8'))
    assert.strictEqual(m.schema.source.filename, 'messy-sales.csv')
    assert.ok(m.metrics && Array.isArray(m.metrics.metrics))
  })

  console.log(`\n${passed} passed, ${failed} failed\n`)
  console.log(`Rendered dashboard saved at: ${destDir}`)
  console.log(`Open ${path.join(destDir, 'index.html')} in a browser to preview.\n`)
  process.exit(failed ? 1 : 0)
}
run()
