import type { RawTable } from '../ingest'

/**
 * Star-schema detection + auto-join for multi-file uploads.
 *
 * Real BI datasets almost never come as one flat CSV. They come as:
 *   - One or more FACT tables (transactions, orders, events)
 *   - Several DIMENSION tables (customers, products, stores, regions)
 * joined via foreign keys named like `customer_id`, `product_id`, etc.
 *
 * We auto-detect that shape by:
 *   1. Finding *_id columns shared across files.
 *   2. Identifying PK files — the one where each id-column value is unique.
 *   3. Marking a file as a FACT when it references 2+ PKs from other files.
 *   4. Picking the fact with the most FK references (tiebreak: row count).
 *   5. Left-joining every referenced dim into that fact.
 *
 * Non-star or partial-star inputs return null so the caller falls back to
 * same-schema concat or its own error. Every join decision is logged in
 * the returned notes so the client sees exactly what got matched with what.
 */

interface Table {
  name: string          // original filename — matches what the user uploaded
  headers: string[]
  rows: Record<string, string>[]
}

interface JoinEdge {
  fromTable: string
  fromKey: string
  toTable: string
  toKey: string
  matched: number       // fact rows that found a matching dim row
  missed: number        // fact rows that didn't
}

interface StarPlan {
  fact: Table
  joins: JoinEdge[]     // each join enriches the fact with dim columns
  denormalizedRows: Record<string, string>[]
  denormalizedHeaders: string[]
  notes: string[]
}

/** Match anything ending in `_id` OR the word "id" as its own token. Excludes
 *  timestamp-looking columns (`transaction_id` matches; `paid_at_id` matches
 *  too — it's still a column named like an id, safe to consider). */
function idColumns(headers: string[]): string[] {
  return headers.filter((h) => /(^id$|_id$)/i.test(h))
}

/** Is `col` unique across every non-blank row in `table`? Cheap PK check. */
function isPrimaryKey(table: Table, col: string): boolean {
  const seen = new Set<string>()
  for (const r of table.rows) {
    const v = r[col]
    if (v === undefined || v === '') continue
    if (seen.has(v)) return false
    seen.add(v)
  }
  // At least 2 non-blank values, otherwise we can't call it a PK
  return seen.size >= 2
}

export type StarDetectionResult =
  | { detected: true; plan: StarPlan }
  | { detected: false; reason: string }

export function detectAndJoinStarSchema(tables: Table[]): StarDetectionResult {
  if (tables.length < 2) return { detected: false, reason: 'need ≥2 files' }

  // ── 1. Find candidate PKs: for each id column, which files have it AND
  // treat it as a unique key?
  const pkOwner = new Map<string, Table>() // idColumn → the file where it's a PK
  for (const t of tables) {
    for (const col of idColumns(t.headers)) {
      if (pkOwner.has(col)) continue // first-seen wins; ambiguity is fine here — see below
      if (isPrimaryKey(t, col)) pkOwner.set(col, t)
    }
  }

  // ── 2. Score each file: how many FKs from OTHER files does it reference?
  interface Score { table: Table; fkColumns: string[] }
  const scores: Score[] = tables.map((t) => {
    const fks = idColumns(t.headers).filter((col) => {
      const owner = pkOwner.get(col)
      return owner && owner.name !== t.name
    })
    return { table: t, fkColumns: fks }
  })

  // ── 3. Pick the fact: most FKs (≥2), tiebreak by row count.
  const factCandidates = scores.filter((s) => s.fkColumns.length >= 2).sort(
    (a, b) => b.fkColumns.length - a.fkColumns.length || b.table.rows.length - a.table.rows.length,
  )
  if (!factCandidates.length) {
    return { detected: false, reason: 'no fact table detected — no file references 2+ shared id columns' }
  }
  const fact = factCandidates[0]
  const notes: string[] = []
  notes.push(`Detected star schema — fact table: "${fact.table.name}" (${fact.table.rows.length} rows), FK columns: ${fact.fkColumns.join(', ')}`)
  if (factCandidates.length > 1) {
    notes.push(`Additional fact-shaped files detected — will attempt to attach as marker columns for ratio metrics: ${factCandidates.slice(1).map((f) => `"${f.table.name}"`).join(', ')}`)
  }

  // ── 4. Build a join plan. For each FK in the fact, find its dim (owner),
  // do a left join. Then repeat one level: if a dim also has FKs to other
  // dims (e.g. Stores → Regions via region_id), chain that too. Keeps chain
  // shallow (depth 2) so we don't recurse forever on weird schemas.
  const joins: JoinEdge[] = []
  const denormRowsMap: Record<string, string>[] = fact.table.rows.map((r) => ({ ...r, _source_file: fact.table.name }))
  const denormHeaders: string[] = [...fact.table.headers]
  if (!denormHeaders.includes('_source_file')) denormHeaders.push('_source_file')

  // Track column origin so name-collision handling is deterministic:
  // fact table's column wins; dim columns get their bare name unless the fact
  // already has one with that name, in which case the dim's is prefixed.
  const factColSet = new Set(fact.table.headers)

  const enrich = (leftTableName: string, leftKey: string, dim: Table) => {
    // Build dim lookup: PK value → row
    const dimByKey = new Map<string, Record<string, string>>()
    for (const dr of dim.rows) {
      const k = dr[leftKey]
      if (k !== undefined && k !== '') dimByKey.set(k, dr)
    }
    const dimColsToAdd = dim.headers.filter((h) => h !== leftKey)
    // Rename any dim column that already exists in the denorm headers
    const renamedCols: Record<string, string> = {}
    for (const dc of dimColsToAdd) {
      const target = factColSet.has(dc) || denormHeaders.includes(dc) ? `${dim.name.replace(/\.[^.]+$/, '')}_${dc}` : dc
      renamedCols[dc] = target
      if (!denormHeaders.includes(target)) denormHeaders.push(target)
    }

    let matched = 0, missed = 0
    for (const row of denormRowsMap) {
      const k = row[leftKey]
      const dimRow = k ? dimByKey.get(k) : undefined
      if (dimRow) {
        matched++
        for (const dc of dimColsToAdd) row[renamedCols[dc]] = dimRow[dc] ?? ''
      } else {
        missed++
        for (const dc of dimColsToAdd) if (!(renamedCols[dc] in row)) row[renamedCols[dc]] = ''
      }
    }
    joins.push({ fromTable: leftTableName, fromKey: leftKey, toTable: dim.name, toKey: leftKey, matched, missed })
    const pct = denormRowsMap.length ? Math.round((matched / denormRowsMap.length) * 100) : 0
    notes.push(`Joined "${dim.name}" on ${leftKey}: ${matched} of ${denormRowsMap.length} rows matched (${pct}%)${missed ? `, ${missed} unmatched (dim value is blank in that row)` : ''}`)
  }

  const joinedDimNames = new Set<string>([fact.table.name])
  // Level 1: direct joins from the fact.
  for (const fk of fact.fkColumns) {
    const dim = pkOwner.get(fk)
    if (!dim || dim.name === fact.table.name || joinedDimNames.has(dim.name)) continue
    enrich(fact.table.name, fk, dim)
    joinedDimNames.add(dim.name)

    // Level 2: does this dim itself reference other dims we haven't joined yet?
    for (const dimFk of idColumns(dim.headers)) {
      if (dimFk === fk) continue
      const chained = pkOwner.get(dimFk)
      if (!chained || joinedDimNames.has(chained.name)) continue
      enrich(dim.name, dimFk, chained)
      joinedDimNames.add(chained.name)
    }
  }

  // ── Secondary fact tables ──
  // Two strategies, in order:
  //   (a) Row-level flag: if the secondary shares the primary fact's actual
  //       PK, add has_<x> = 1 per row for downstream ratio metrics.
  //   (b) Aggregate ratio: if the secondary shares 2+ FK columns AND a
  //       numeric measure column (e.g. quantity) with the primary, compute
  //       SUM(secondary.qty) as a scalar and expose it as a per-primary-row
  //       broadcast column (constant on every row) — dashboards can then
  //       ratio it against SUM(primary.qty). This handles the common case
  //       of Transactions + Returns joined on product_id/store_id/quantity.
  for (const other of factCandidates.slice(1)) {
    const primaryPkCandidates = idColumns(fact.table.headers).filter((c) => isPrimaryKey(fact.table, c))
    const sharedPk = primaryPkCandidates.find((k) => other.table.headers.includes(k))

    // Strategy (a): row-level flag
    if (sharedPk) {
      const secondaryKeys = new Set(other.table.rows.map((r) => r[sharedPk]).filter((v) => v !== undefined && v !== ''))
      const flagCol = `has_${other.table.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}`
      if (!denormHeaders.includes(flagCol)) denormHeaders.push(flagCol)
      let hits = 0
      for (const row of denormRowsMap) {
        const k = row[sharedPk]
        const has = k && secondaryKeys.has(k)
        row[flagCol] = has ? '1' : '0'
        if (has) hits++
      }
      joinedDimNames.add(other.table.name)
      joins.push({ fromTable: fact.table.name, fromKey: sharedPk, toTable: other.table.name, toKey: sharedPk, matched: hits, missed: denormRowsMap.length - hits })
      const pct = denormRowsMap.length ? Math.round((hits / denormRowsMap.length) * 100) : 0
      notes.push(`Attached secondary fact "${other.table.name}" as flag column "${flagCol}" via ${sharedPk}: ${hits} of ${denormRowsMap.length} rows have a match (${pct}%). Ratio metrics like ${flagCol.replace(/^has_/, '')}_rate = SUM(${flagCol})/COUNT(*) are now available.`)
      continue
    }

    // Strategy (b): aggregate scalar broadcast.
    // Find numeric measure columns shared between primary & secondary
    // (typically `quantity`, `amount`, `count`).
    const numericSharedCols = other.table.headers.filter((c) =>
      fact.table.headers.includes(c) &&
      /(qty|quantity|amount|count|total)/i.test(c),
    )
    if (numericSharedCols.length === 0) {
      notes.push(`Secondary fact "${other.table.name}" was NOT joined — no shared row-level key with "${fact.table.name}" and no shared numeric measure to aggregate.`)
      continue
    }
    // For each shared measure: compute totals for BOTH facts at once, then
    // broadcast three pre-computed scalars as constant columns:
    //   <secondary>_<measure>_total   → constant = SUM(secondary.measure)
    //   primary_<measure>_total       → constant = SUM(primary.measure)
    //   <secondary>_<measure>_rate    → constant = secondary_total / primary_total
    //
    // Picker emits AVERAGE (not sum) on the *_rate/*_total columns — since
    // every row holds the same value, average returns the correct scalar.
    // Names get a `_scalar` suffix on the actual column so the picker knows
    // to use average, and *_rate variants are auto-picked as ratio KPIs.
    const baseName = other.table.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()
    for (const measure of numericSharedCols) {
      let secondarySum = 0, secondaryCounted = 0
      for (const r of other.table.rows) {
        const n = Number(r[measure])
        if (Number.isFinite(n)) { secondarySum += n; secondaryCounted++ }
      }
      let primarySum = 0
      for (const r of fact.table.rows) {
        const n = Number(r[measure])
        if (Number.isFinite(n)) primarySum += n
      }
      const rate = primarySum > 0 ? secondarySum / primarySum : 0

      const totalCol = `${baseName}_${measure}_scalar`
      const rateCol = `${baseName}_${measure}_rate_scalar`
      if (!denormHeaders.includes(totalCol)) denormHeaders.push(totalCol)
      if (!denormHeaders.includes(rateCol)) denormHeaders.push(rateCol)
      for (const row of denormRowsMap) {
        row[totalCol] = String(secondarySum)
        row[rateCol] = String(rate)
      }
      const ratePct = (rate * 100).toFixed(2)
      notes.push(`Cross-fact aggregate: SUM(${other.table.name}.${measure}) = ${secondarySum.toLocaleString()} vs SUM(${fact.table.name}.${measure}) = ${primarySum.toLocaleString()} → rate ${ratePct}%. Broadcast as scalar columns "${totalCol}" and "${rateCol}" (use AVERAGE, not SUM, on these).`)
    }
    joinedDimNames.add(other.table.name)
  }

  // Any files that never got joined — mention them so the user knows they
  // were dropped (rather than silently discarded).
  const dropped = tables.filter((t) => !joinedDimNames.has(t.name))
  if (dropped.length) {
    notes.push(`Files not joined into the fact: ${dropped.map((t) => `"${t.name}"`).join(', ')}. They shared no id column with "${fact.table.name}" or its dimensions.`)
  }

  return {
    detected: true,
    plan: {
      fact: fact.table,
      joins,
      denormalizedRows: denormRowsMap,
      denormalizedHeaders: denormHeaders,
      notes,
    },
  }
}
