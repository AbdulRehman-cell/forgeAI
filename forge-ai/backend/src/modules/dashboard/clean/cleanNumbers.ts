import { detectNumber } from '../profile/currencyDetection'
import type { ColumnProfile } from '../profile/columnTypes'
import type { Changelog } from './changelog'

/** Symbol → ISO best-guess. `$` is ambiguous — never resolved here without
 *  explicit config from the caller. */
const SYMBOL_TO_ISO: Record<string, string | null> = {
  '$': null,     // could be USD/CAD/AUD/… — REQUIRE explicit config
  '€': 'EUR',
  '£': 'GBP',
  '¥': null,     // JPY vs CNY — also ambiguous
  '₹': 'INR',
  '₽': 'RUB',
  'kr': null,    // SEK vs NOK vs DKK — ambiguous
}

export interface CurrencyDecision {
  column: string
  /** The ISO code every value in this column is now treated as being IN. */
  resolvedIso: string | null
  /** Where the resolution came from — user override, unambiguous symbol, or a
   *  best-guess we're warning about. */
  source: 'config' | 'unambiguous_symbol' | 'majority_symbol' | 'unresolved'
}

/**
 * Coerce a currency/number column to (number | null). We do NOT do FX
 * conversion — mixing symbols is a real hazard and the caller must decide
 * whether "$100 + €80 = 180" is acceptable. When symbols are mixed and no
 * config override is provided, we resolve to the majority symbol's ISO and
 * emit a LOUD warning; the numbers get through so the pipeline doesn't stall,
 * but the changelog makes the assumption impossible to miss.
 */
export function cleanNumberColumn(
  column: string,
  values: (string | null)[],
  profile: ColumnProfile,
  log: Changelog,
  configuredIso?: string,
): { values: (number | null)[]; decision: CurrencyDecision } {
  const isCurrency = profile.detectedType === 'currency'
  const symbols = profile.currencySymbols ?? {}
  const symbolNames = Object.keys(symbols)

  // ── Currency resolution ──
  let resolvedIso: string | null = null
  let source: CurrencyDecision['source'] = 'unresolved'
  if (isCurrency) {
    if (configuredIso) {
      resolvedIso = configuredIso
      source = 'config'
      log.add({
        kind: 'currency_normalized',
        severity: 'info',
        column,
        count: profile.totalRows - profile.blankRows,
        message: `${column}: treated as ${configuredIso} (from config override).`,
        details: { symbolsSeen: symbolNames, resolvedIso },
      })
    } else if (symbolNames.length === 1) {
      const only = symbolNames[0]
      const iso = SYMBOL_TO_ISO[only] ?? (/^[A-Z]{3}$/.test(only) ? only : null)
      if (iso) {
        resolvedIso = iso
        source = 'unambiguous_symbol'
        log.add({
          kind: 'currency_normalized', severity: 'info', column,
          count: profile.totalRows - profile.blankRows,
          message: `${column}: treated as ${iso} (only symbol seen was "${only}").`,
          details: { resolvedIso },
        })
      } else {
        source = 'unresolved'
        log.add({
          kind: 'currency_assumed', severity: 'warning', column,
          count: profile.totalRows - profile.blankRows,
          message: `${column}: symbol "${only}" is ambiguous (could be several ISO codes). Values coerced to numeric but currency code is undeclared — set currencyOverrides["${column}"] to fix.`,
          details: { symbol: only },
        })
      }
    } else if (symbolNames.length > 1) {
      // Mixed symbols — pick the majority so downstream math works, but scream.
      const sorted = Object.entries(symbols).sort((a, b) => b[1] - a[1])
      const [top, second] = sorted
      resolvedIso = SYMBOL_TO_ISO[top[0]] ?? (/^[A-Z]{3}$/.test(top[0]) ? top[0] : null)
      source = 'majority_symbol'
      log.add({
        kind: 'currency_mixed_unresolved', severity: 'error', column,
        count: profile.totalRows - profile.blankRows,
        message: `${column}: MIXED currency symbols (${sorted.map(([s, n]) => `${s}×${n}`).join(', ')}). Values coerced to raw numeric with NO FX conversion — aggregating them will produce wrong totals. Set currencyOverrides["${column}"] to declare a single currency, or split into per-currency columns.`,
        details: { symbolCounts: symbols, majoritySymbol: top[0], secondSymbol: second?.[0] },
      })
    }
  }

  // ── Value coercion ──
  let unparseable = 0
  const out: (number | null)[] = values.map((raw) => {
    if (raw === null || raw === '') return null
    const n = detectNumber(raw)
    if (!n) {
      unparseable++
      return null
    }
    return n.value
  })

  if (unparseable > 0) {
    log.add({
      kind: 'number_unparseable', severity: 'warning', column, count: unparseable,
      message: `${column}: ${unparseable} value(s) could not be parsed as numbers and were kept as null.`,
    })
  }

  return { values: out, decision: { column, resolvedIso, source } }
}
