import fs from 'fs'
import { ingest } from '../ingest'
import type { RawTable } from '../ingest'
import type { SourceAdapter } from './adapter'
import { detectAndJoinStarSchema } from './starSchema'

/**
 * Upload source — supports either a single file (backwards-compatible with
 * the original single-upload flow) OR multiple files that get merged when
 * their schemas match.
 *
 * Multi-file design:
 *   - Each file parsed independently, so a broken one doesn't kill the rest.
 *   - Headers compared as SETS (order-insensitive). If they match across all
 *     files, rows are concatenated and a `_source_file` column is added so
 *     users can group/filter by source in the dashboard.
 *   - If any header set differs, the adapter throws with a precise diff so
 *     the client knows exactly which columns are missing/extra where. No
 *     silent partial merges — losing data on a merge is exactly the trust-
 *     breaking behavior the cleaning stage's "flag over guess" rule forbids.
 */

export interface UploadFile {
  uploadPath: string
  originalFilename: string
  mimeType: string
}

export interface UploadSourceConfig {
  /** Legacy single-file fields — still accepted so existing repos keep working. */
  uploadPath?: string
  originalFilename?: string
  mimeType?: string
  /** New multi-file field. When present, `uploadPath` etc. are ignored. */
  files?: UploadFile[]
}

export const UploadSource: SourceAdapter<UploadSourceConfig> = {
  kind: 'upload',
  async fetch(config): Promise<RawTable> {
    const files: UploadFile[] = config.files?.length
      ? config.files
      : (config.uploadPath ? [{
          uploadPath: config.uploadPath,
          originalFilename: config.originalFilename ?? 'upload',
          mimeType: config.mimeType ?? 'text/csv',
        }] : [])

    if (!files.length) throw new Error('No upload file paths in config.')

    // Parse each file into a RawTable. Fail fast on any single-file parse
    // error — a broken source is worse than missing data.
    const tables: { file: UploadFile; table: RawTable }[] = []
    for (const f of files) {
      if (!fs.existsSync(f.uploadPath)) {
        throw new Error(`Uploaded file "${f.originalFilename}" no longer on disk (${f.uploadPath}). Re-upload to rebuild.`)
      }
      const buf = fs.readFileSync(f.uploadPath)
      tables.push({ file: f, table: ingest(buf, f.originalFilename, f.mimeType) })
    }

    if (tables.length === 1) return tables[0].table

    // ── Step 0: pre-merge groups of files that already share a schema. ──
    // Real datasets often ship "Transactions_1997.csv + Transactions_1998.csv"
    // (identical columns, different periods) alongside per-entity files. Star
    // detection needs to see ONE fact table, not two rival ones, or PK
    // detection breaks and the joins go wrong. So we group by header signature
    // and concat each group first — the same-schema branch of the merge, but
    // internal.
    const groupSig = (headers: string[]) => [...headers].sort().join('|')
    const bySig = new Map<string, { file: UploadFile; table: RawTable }[]>()
    for (const t of tables) {
      const s = groupSig(t.table.headers)
      const g = bySig.get(s) ?? []
      g.push(t)
      bySig.set(s, g)
    }
    const preMergeNotes: string[] = []
    const collapsed: { file: UploadFile; table: RawTable }[] = []
    for (const group of bySig.values()) {
      if (group.length === 1) { collapsed.push(group[0]); continue }
      // Concat: canonical header order from the first file, merge rows, tag with _source_file
      const canonicalHeaders = [...group[0].table.headers]
      if (!canonicalHeaders.includes('_source_file')) canonicalHeaders.push('_source_file')
      const mergedRows: Record<string, string>[] = []
      for (const { file: gf, table } of group) {
        for (const r of table.rows) {
          const row: Record<string, string> = { _source_file: gf.originalFilename }
          for (const h of canonicalHeaders) if (h !== '_source_file') row[h] = r[h] ?? ''
          mergedRows.push(row)
        }
      }
      const combinedName = group.map((g) => g.file.originalFilename).join(' + ')
      preMergeNotes.push(`Pre-merged ${group.length} same-schema files (${group.map((g) => g.file.originalFilename).join(', ')}) → ${mergedRows.length} rows before star-schema detection`)
      collapsed.push({
        // Synthetic combined "file" — uses the first file's actual path/mime for legacy access.
        file: { ...group[0].file, originalFilename: combinedName },
        table: {
          kind: group[0].table.kind,
          filename: combinedName,
          bytes: group.reduce((s, g) => s + g.table.bytes, 0),
          headers: canonicalHeaders,
          rows: mergedRows,
          notes: group.flatMap((g) => g.table.notes),
        },
      })
    }
    // Replace `tables` with the collapsed list for the rest of the pipeline.
    tables.length = 0
    tables.push(...collapsed)

    if (tables.length === 1) {
      // All uploaded files collapsed into one same-schema group — return that.
      const only = tables[0].table
      return { ...only, notes: [...preMergeNotes, ...only.notes] }
    }

    // ── Step 1+2 (unchanged) — try same-schema concat then star-schema. ──

    const referenceSet = new Set(tables[0].table.headers)
    const diffs: string[] = []
    for (const { file, table } of tables.slice(1)) {
      const set = new Set(table.headers)
      const missing = [...referenceSet].filter((h) => !set.has(h))
      const extra = [...set].filter((h) => !referenceSet.has(h))
      if (missing.length || extra.length) {
        const parts: string[] = []
        if (missing.length) parts.push(`missing ${missing.map((h) => `"${h}"`).join(', ')}`)
        if (extra.length) parts.push(`extra ${extra.map((h) => `"${h}"`).join(', ')}`)
        diffs.push(`"${file.originalFilename}" ${parts.join('; ')}`)
      }
    }

    if (diffs.length) {
      // Schemas differ — try the star-schema path before failing.
      const starInput = tables.map(({ file, table }) => ({
        name: file.originalFilename, headers: table.headers, rows: table.rows,
      }))
      const star = detectAndJoinStarSchema(starInput)
      if (star.detected) {
        const perFileNotes = tables.flatMap(({ file, table }) =>
          table.notes.map((n) => `[${file.originalFilename}] ${n}`),
        )
        return {
          kind: 'csv',
          filename: `star: ${star.plan.fact.name} + ${star.plan.joins.length} dim(s)`,
          bytes: tables.reduce((s, t) => s + t.table.bytes, 0),
          headers: star.plan.denormalizedHeaders,
          rows: star.plan.denormalizedRows,
          notes: [...preMergeNotes, ...star.plan.notes, ...perFileNotes],
        }
      }
      // Neither concat nor star — throw with the same-schema diff PLUS the
      // star-detection reason so the user knows both routes were tried.
      throw new Error(
        `Cannot merge files. Same-schema concat failed because column sets differ — reference file "${tables[0].file.originalFilename}" has: ${tables[0].table.headers.join(', ')}. Diffs: ${diffs.join(' | ')}. Star-schema join failed because ${star.reason}. Options: (1) upload files with identical column sets, (2) upload files that share id columns (customer_id, product_id) so we can auto-join, or (3) upload just one file.`,
      )
    }

    // Merge — canonical header order = reference file's order + '_source_file'
    const mergedHeaders = [...tables[0].table.headers]
    if (!mergedHeaders.includes('_source_file')) mergedHeaders.push('_source_file')

    const mergedRows: Record<string, string>[] = []
    let mergedNotes: string[] = []
    for (const { file, table } of tables) {
      for (const r of table.rows) {
        const row: Record<string, string> = { _source_file: file.originalFilename }
        for (const h of mergedHeaders) if (h !== '_source_file') row[h] = r[h] ?? ''
        mergedRows.push(row)
      }
      // Preserve per-file parse notes, prefixed
      mergedNotes = mergedNotes.concat(table.notes.map((n) => `[${file.originalFilename}] ${n}`))
    }

    // A summary note showing the per-file row breakdown — the client should
    // always see how many rows came from where.
    mergedNotes.unshift(
      `Merged ${tables.length} files: ${tables.map(({ file, table }) => `${file.originalFilename} (${table.rows.length} rows)`).join(', ')} → ${mergedRows.length} total rows. Added _source_file column for filtering.`,
    )

    return {
      kind: tables[0].table.kind,
      filename: tables.length === 1 ? tables[0].file.originalFilename : `${tables.length} files merged`,
      bytes: tables.reduce((s, t) => s + t.table.bytes, 0),
      headers: mergedHeaders,
      rows: mergedRows,
      notes: mergedNotes,
    }
  },
}
