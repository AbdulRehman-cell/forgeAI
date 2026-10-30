/**
 * The public address of this ForgeAI backend as deployed sites reach it: form
 * submissions, hosted MERN apps' API proxy, locally served sites.
 *
 * SITES_BASE_URL wins when it is a real URL. A placeholder left in the
 * environment (e.g. "https://your-forgeai-backend.onrender.com") must never
 * become a live address — every hosted form and API call would go to a host we
 * don't own — so it falls back to Render's own URL for this service.
 */
export function publicApiBase(): string {
  const configured = (process.env.SITES_BASE_URL ?? '').trim()
  const usable = /^https?:\/\/[^\s/<>]+\.[^\s/<>]+/i.test(configured) && !/your-|example\.(com|org|net)|placeholder|changeme/i.test(configured)
  if (configured && !usable) console.warn(`[config] SITES_BASE_URL looks like a placeholder (${configured}) — using ${process.env.RENDER_EXTERNAL_URL ?? 'localhost'} instead`)
  const base = (usable ? configured : '') || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT ?? 4000}`
  return base.replace(/\/$/, '')
}
