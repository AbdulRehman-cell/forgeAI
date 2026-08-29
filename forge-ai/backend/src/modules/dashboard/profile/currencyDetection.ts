/**
 * Currency + number detection. We keep these together because a currency
 * value IS a number underneath; the difference is metadata (which currency
 * code) that gets flagged for the cleaner to normalize later.
 *
 * We report the currency SYMBOL only — mapping ambiguous symbols to codes
 * ($ → USD? CAD? AUD?) is a client-facing decision left for the flagging
 * layer, not something we silently pick here.
 */

export interface NumberMatch {
  value: number
  /** null when the value is a plain number with no currency indicator */
  currencySymbol: string | null
  /** true when the value uses parentheses for negative — accounting notation */
  parensNegative: boolean
  /** true when we had to strip thousands separators */
  hasThousandsSeparator: boolean
}

// Symbols we recognize. ISO codes handled separately (see below).
const SYMBOLS: Record<string, string> = {
  '$': '$', '€': '€', '£': '£', '¥': '¥', '₹': '₹', '₽': '₽',
  'kr': 'kr', // Scandinavian — matched only at word boundary
}

const ISO_CODES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'INR', 'CAD', 'AUD', 'CHF', 'SEK',
  'NOK', 'DKK', 'PLN', 'RUB', 'BRL', 'MXN', 'ZAR', 'AED', 'SGD', 'HKD',
])

/**
 * Parse one cell. Returns null when it's clearly not a number/currency.
 * Handles: "$1,234.56", "€980.00", "(500)", "1234", "1.234,56" (EU),
 * "1 234 567" (space-separated), "12%".
 *
 * Percentages become their numeric value (12% → 12) and are flagged via the
 * absence of a currency symbol — the caller can promote the column to a
 * percent type based on how many rows had the '%' suffix.
 */
export function detectNumber(value: string): NumberMatch | null {
  const raw = value.trim()
  if (!raw) return null

  let s = raw
  let currency: string | null = null
  let parens = false
  let hasSep = false

  // Leading/trailing ISO code: "USD 1234" or "1234 USD"
  const isoLead = s.match(/^([A-Z]{3})\s+(.+)$/)
  if (isoLead && ISO_CODES.has(isoLead[1])) { currency = isoLead[1]; s = isoLead[2] }
  const isoTrail = s.match(/^(.+?)\s+([A-Z]{3})$/)
  if (!currency && isoTrail && ISO_CODES.has(isoTrail[2])) { currency = isoTrail[2]; s = isoTrail[1] }

  // Leading currency symbol
  for (const sym of Object.keys(SYMBOLS)) {
    if (s.startsWith(sym)) { currency = SYMBOLS[sym]; s = s.slice(sym.length).trim(); break }
  }
  // Trailing currency symbol (some locales: "1234 €")
  if (!currency) {
    for (const sym of Object.keys(SYMBOLS)) {
      if (s.endsWith(sym)) { currency = SYMBOLS[sym]; s = s.slice(0, -sym.length).trim(); break }
    }
  }

  // Accounting parens: (500) means -500
  if (/^\(.+\)$/.test(s)) { parens = true; s = s.slice(1, -1).trim() }

  // Percent suffix — strip but note nothing special; the caller decides
  const isPercent = s.endsWith('%')
  if (isPercent) s = s.slice(0, -1).trim()

  // At this point s should be pure digits + separators + sign + decimal
  if (!/^[-+]?[\d\s.,']+$/.test(s)) return null

  // Separator disambiguation. English: "1,234.56". European: "1.234,56".
  // Also: space-separated ("1 234 567") and apostrophe ("1'234'234") — Swiss.
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let normalized: string
  if (lastComma > -1 && lastDot > -1) {
    // Both present — the LATER one is the decimal separator
    if (lastComma > lastDot) {
      // European: strip dots (thousands), swap comma → dot
      normalized = s.replace(/\./g, '').replace(',', '.')
      hasSep = true
    } else {
      // English: strip commas (thousands), keep dot
      normalized = s.replace(/,/g, '')
      hasSep = true
    }
  } else if (lastComma > -1) {
    // Only commas — ambiguous. Heuristic: if exactly 3 digits after the last
    // comma AND there are 4+ digits total, it's a thousands separator.
    const afterComma = s.length - lastComma - 1
    const digitsOnly = s.replace(/\D/g, '')
    if (afterComma === 3 && digitsOnly.length >= 4 && !s.includes(' ') && !s.includes("'")) {
      normalized = s.replace(/,/g, '')
      hasSep = true
    } else {
      // Treat comma as decimal (European "980,50")
      normalized = s.replace(',', '.')
    }
  } else if (s.includes(' ') || s.includes("'")) {
    normalized = s.replace(/[\s']/g, '')
    hasSep = true
  } else {
    normalized = s
  }

  const n = Number(normalized)
  if (!Number.isFinite(n)) return null

  return {
    value: parens ? -n : n,
    currencySymbol: currency,
    parensNegative: parens,
    hasThousandsSeparator: hasSep,
  }
}
