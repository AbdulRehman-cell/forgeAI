// One unreadable line in a model-written stylesheet ("justify-space-between;"
// with no colon) fails the whole Vite build. These helpers fix that without an
// AI: drop exactly what the CSS parser cannot read, one error at a time.

export interface CssRepair {
  css: string
  /** "line: text (reason)" for every line taken out */
  removed: string[]
  /** Parses cleanly now */
  ok: boolean
}

/** Removes the lines a CSS parser rejects until the sheet parses (or gives up
 *  after `max` removals and returns the original untouched). */
export function repairCss(css: string, max = 25): CssRepair {
  // Loaded on demand: nothing heavy at boot in the 120 MB heap
  const postcss = require('postcss') as typeof import('postcss')
  let out = css
  const removed: string[] = []
  for (let i = 0; i <= max; i++) {
    try {
      postcss.parse(out)
      return { css: out, removed, ok: true }
    } catch (e: any) {
      if (e?.name !== 'CssSyntaxError' || !e.line || i === max) break
      const lines = out.split('\n')
      const at = e.line - 1
      if (at < 0 || at >= lines.length) break
      removed.push(`${e.line}: ${lines[at].trim().slice(0, 80)} (${e.reason})`)
      lines.splice(at, 1)
      out = lines.join('\n')
    }
  }
  return { css, removed: [], ok: false }
}

/** The stylesheet a Vite CSS error names, with its line — e.g.
 *  "[postcss] /…/src/index.css:1967:3: Unknown word" */
export function cssErrorFile(errorText: string): string | null {
  return /\[(?:vite:css|postcss)\][\s\S]*?((?:[A-Za-z]:)?[^\s:]+\.(?:css|scss)):\d+:\d+/.exec(errorText)?.[1] ?? null
}
