// ─── ForgeAI Brand Kit ──────────────────────────────────────────────────────
// A generated site's identity is decided HERE, in code, not improvised by the
// model file by file. The art director picks four things (brand colour, light or
// dark, one curated font pairing, the business name); this module turns them
// into a contrast-checked palette, loaded fonts, a monogram logo, the photo-first
// hero and the taste rules every page prompt carries. The brand layer CSS is
// appended LAST to every stylesheet, so no AI-written rule can undo it.

import { BLOCKS_CSS, applyKitExtras, blocksBrief, findWhatsApp, pickPlaybook, type Playbook } from './blocks'

export type BrandMode = 'light' | 'dark'
type Shape = 'sharp' | 'soft' | 'round'

export interface FontPairing {
  id: string
  heading: { family: string; weights: number[]; fallback: string }
  body: { family: string; weights: number[]; fallback: string }
  /** Uppercase headlines suit condensed display faces (Oswald, Bebas…) */
  headingCase: 'uppercase' | 'none'
  headingWeight: number
  headingTracking: string
  headingLeading: number
  shape: Shape
  fits: string
  match: RegExp
  /** Used when the art director gave no usable brand colour */
  defaultColor: string
}

const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
const SERIF = "Georgia, 'Times New Roman', serif"
const CONDENSED = "'Arial Narrow', 'Roboto Condensed', sans-serif"

// Order matters for keyword fallback: specific industries before broad ones.
export const FONT_PAIRINGS: FontPairing[] = [
  {
    id: 'industrial', heading: { family: 'Oswald', weights: [500, 600, 700], fallback: CONDENSED },
    body: { family: 'Inter', weights: [400, 500, 600, 700], fallback: SANS },
    headingCase: 'uppercase', headingWeight: 600, headingTracking: '0.005em', headingLeading: 0.98, shape: 'sharp',
    fits: 'recruitment, staffing, logistics, warehousing, construction, security, manufacturing',
    match: /recruit|staffing|logistic|warehous|construct|security guard|manufactur|haulage|freight|removal|industrial|forklift/i,
    defaultColor: '#f26b1d',
  },
  {
    id: 'athletic', heading: { family: 'Barlow Condensed', weights: [600, 700, 800], fallback: CONDENSED },
    body: { family: 'Barlow', weights: [400, 500, 600, 700], fallback: SANS },
    headingCase: 'uppercase', headingWeight: 700, headingTracking: '0.01em', headingLeading: 0.94, shape: 'sharp',
    fits: 'sports, gyms, fitness, sports equipment, martial arts, motorsport',
    match: /sport|\bgym|fitness|hockey|football|soccer|cricket|basketball|athlet|martial|boxing|crossfit|cycling|motorsport|racing|tennis|golf/i,
    defaultColor: '#d62839',
  },
  {
    id: 'poster', heading: { family: 'Bebas Neue', weights: [400], fallback: CONDENSED },
    body: { family: 'Inter', weights: [400, 500, 600, 700], fallback: SANS },
    headingCase: 'uppercase', headingWeight: 400, headingTracking: '0.02em', headingLeading: 0.92, shape: 'sharp',
    fits: 'events, nightlife, barbers, streetwear, festivals, tattoo studios',
    match: /\bevents?\b|night ?club|nightlife|barber|streetwear|festival|tattoo|concert|music venue|\bdj\b/i,
    defaultColor: '#e63946',
  },
  {
    id: 'luxury', heading: { family: 'Cormorant Garamond', weights: [500, 600, 700], fallback: SERIF },
    body: { family: 'Montserrat', weights: [400, 500, 600], fallback: SANS },
    headingCase: 'none', headingWeight: 600, headingTracking: '-0.005em', headingLeading: 1.0, shape: 'soft',
    fits: 'hotels, jewellery, weddings, fine dining, spas, luxury goods',
    match: /hotel|resort|jewel|wedding|luxury|fine dining|\bspa\b|villa|yacht|perfume|fragrance/i,
    defaultColor: '#8c6d46',
  },
  {
    id: 'beauty', heading: { family: 'DM Serif Display', weights: [400], fallback: SERIF },
    body: { family: 'DM Sans', weights: [400, 500, 700], fallback: SANS },
    headingCase: 'none', headingWeight: 400, headingTracking: '-0.01em', headingLeading: 1.04, shape: 'soft',
    fits: 'salons, beauty, skincare, fashion, florists, interior design',
    match: /salon|beauty|skin ?care|cosmetic|\bnails?\b|lash|brow|fashion|florist|flower|interior design|makeup/i,
    defaultColor: '#b4536a',
  },
  {
    id: 'artisan', heading: { family: 'Fraunces', weights: [600, 700], fallback: SERIF },
    body: { family: 'Inter', weights: [400, 500, 600, 700], fallback: SANS },
    headingCase: 'none', headingWeight: 600, headingTracking: '-0.02em', headingLeading: 1.02, shape: 'soft',
    fits: 'bakeries, cafés, restaurants, farms, food brands, artisan goods',
    match: /baker|bakes|\bcaf[eé]|coffee|restaurant|bistro|\bfood|kitchen|\bfarm|artisan|\bdeli\b|patisserie|chocolat|brewer|winery/i,
    defaultColor: '#b5562b',
  },
  {
    id: 'editorial', heading: { family: 'Playfair Display', weights: [600, 700], fallback: SERIF },
    body: { family: 'Source Sans 3', weights: [400, 600, 700], fallback: SANS },
    headingCase: 'none', headingWeight: 700, headingTracking: '-0.01em', headingLeading: 1.05, shape: 'soft',
    fits: 'law firms, finance, real estate, publishing, heritage brands',
    match: /\blaw\b|legal|solicitor|attorney|lawyer|finance|wealth|invest|real estate|property|realty|estate agent|publish|magazine|heritage/i,
    defaultColor: '#1f3b5c',
  },
  {
    id: 'clinical', heading: { family: 'Manrope', weights: [600, 700, 800], fallback: SANS },
    body: { family: 'Inter', weights: [400, 500, 600, 700], fallback: SANS },
    headingCase: 'none', headingWeight: 800, headingTracking: '-0.025em', headingLeading: 1.05, shape: 'soft',
    fits: 'clinics, dentists, healthcare, pharmacies, physio, insurance',
    match: /clinic|dental|dentist|health|medical|doctor|hospital|pharma|physio|therapy|care home|insurance|optician|\bvet\b|veterinar/i,
    defaultColor: '#0e7c86',
  },
  {
    id: 'friendly', heading: { family: 'Nunito', weights: [700, 800, 900], fallback: SANS },
    body: { family: 'Nunito Sans', weights: [400, 600, 700], fallback: SANS },
    headingCase: 'none', headingWeight: 800, headingTracking: '-0.01em', headingLeading: 1.05, shape: 'round',
    fits: 'schools, nurseries, kids, pets, education, charities, community groups',
    match: /school|nursery|kindergarten|\bkids?\b|child|daycare|tutor|education|academy|\bpets?\b|\bdogs?\b|grooming|charity|community|church|mosque/i,
    defaultColor: '#f08c00',
  },
  {
    id: 'trades', heading: { family: 'Roboto Slab', weights: [600, 700], fallback: SERIF },
    body: { family: 'Roboto', weights: [400, 500, 700], fallback: SANS },
    headingCase: 'none', headingWeight: 700, headingTracking: '-0.01em', headingLeading: 1.08, shape: 'sharp',
    fits: 'plumbers, electricians, auto repair, cleaning, landscaping, home services',
    match: /plumb|electrician|auto repair|mechanic|garage|cleaning|landscap|garden|roofing|hvac|handyman|pest control|locksmith|decorat|carpent/i,
    defaultColor: '#1565c0',
  },
  {
    id: 'studio', heading: { family: 'Syne', weights: [600, 700, 800], fallback: SANS },
    body: { family: 'Inter', weights: [400, 500, 600, 700], fallback: SANS },
    headingCase: 'none', headingWeight: 700, headingTracking: '-0.02em', headingLeading: 1.0, shape: 'sharp',
    fits: 'creative studios, architecture, photography, portfolios, design agencies',
    match: /studio|architect|photograph|portfolio|design agency|creative agency|video production|branding agency|art gallery/i,
    defaultColor: '#1a1a1a',
  },
  {
    id: 'retail', heading: { family: 'Archivo', weights: [600, 700, 800], fallback: SANS },
    body: { family: 'Archivo', weights: [400, 500], fallback: SANS },
    headingCase: 'none', headingWeight: 800, headingTracking: '-0.03em', headingLeading: 1.0, shape: 'sharp',
    fits: 'e-commerce, electronics, furniture, consumer products, car dealers',
    match: /\bshop|\bstore|e-?commerce|retail|electronics|furniture|gadget|appliance|car dealer|showroom|apparel/i,
    defaultColor: '#e4572e',
  },
  {
    id: 'travel', heading: { family: 'Outfit', weights: [600, 700, 800], fallback: SANS },
    body: { family: 'Outfit', weights: [400, 500], fallback: SANS },
    headingCase: 'none', headingWeight: 700, headingTracking: '-0.03em', headingLeading: 1.02, shape: 'round',
    fits: 'travel, tourism, adventure, casual dining, delivery',
    match: /travel|\btours?\b|holiday|adventure|trek|safari|airline|\bvisa\b|hostel|camping|takeaway|delivery/i,
    defaultColor: '#0a9396',
  },
  {
    id: 'corporate', heading: { family: 'IBM Plex Sans', weights: [500, 600, 700], fallback: SANS },
    body: { family: 'IBM Plex Sans', weights: [400], fallback: SANS },
    headingCase: 'none', headingWeight: 600, headingTracking: '-0.02em', headingLeading: 1.06, shape: 'sharp',
    fits: 'consulting, B2B services, accounting, engineering firms',
    match: /consult|accounting|accountant|audit|\bb2b\b|corporate|enterprise|advisory|\btax\b|bookkeep|engineering firm/i,
    defaultColor: '#1d4f91',
  },
  {
    id: 'tech', heading: { family: 'Space Grotesk', weights: [500, 600, 700], fallback: SANS },
    body: { family: 'Inter', weights: [400, 500, 600, 700], fallback: SANS },
    headingCase: 'none', headingWeight: 700, headingTracking: '-0.03em', headingLeading: 1.0, shape: 'soft',
    fits: 'SaaS, AI, developer tools, crypto, digital agencies',
    match: /saas|software|\bai\b|developer|\bapi\b|crypto|blockchain|web3|automation|analytics|cloud/i,
    defaultColor: '#2b59ff',
  },
  {
    id: 'startup', heading: { family: 'Plus Jakarta Sans', weights: [600, 700, 800], fallback: SANS },
    body: { family: 'Plus Jakarta Sans', weights: [400, 500], fallback: SANS },
    headingCase: 'none', headingWeight: 800, headingTracking: '-0.035em', headingLeading: 1.02, shape: 'round',
    fits: 'apps, fintech, marketplaces, consumer startups',
    match: /fintech|marketplace|mobile app|\bapp\b|wallet|payments|startup|platform/i,
    defaultColor: '#5b3df5',
  },
]

const DEFAULT_PAIRING = 'clinical'

const RADII: Record<Shape, { sm: string; base: string; lg: string; xl: string; btn: string }> = {
  sharp: { sm: '6px', base: '10px', lg: '14px', xl: '20px', btn: '6px' },
  soft: { sm: '8px', base: '14px', lg: '20px', xl: '28px', btn: '10px' },
  round: { sm: '10px', base: '18px', lg: '24px', xl: '32px', btn: '999px' },
}

// ─── Colour ──────────────────────────────────────────────────────────────────
// OKLCH keeps a hue recognisable while lightness moves, so every derived shade
// (hover, text-safe ink, on-dark accent, tinted neutrals) still reads as the brand.

type RGB = [number, number, number]

function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB
}
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLinear = (c: number) => {
  const v = Math.min(1, Math.max(0, c))
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
}
const toHex = (rgb: number[]) => '#' + rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')

function rgbToOklch(rgb: RGB): [number, number, number] {
  const [r, g, b] = rgb.map(toLinear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360]
}

function oklchToLinear(L: number, C: number, H: number): number[] {
  const a = C * Math.cos((H * Math.PI) / 180)
  const b = C * Math.sin((H * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/** OKLCH → hex, giving up chroma (never hue or lightness) to stay inside sRGB. */
function oklch(L: number, C: number, H: number): string {
  let c = C
  for (let i = 0; i < 40; i++) {
    const lin = oklchToLinear(L, c, H)
    if (lin.every((v) => v >= -0.0005 && v <= 1.0005)) return toHex(lin.map(fromLinear))
    c *= 0.9
  }
  return toHex(oklchToLinear(L, 0, H).map(fromLinear))
}

function luminance(hex: string): number {
  const [r, g, b] = (parseHex(hex) ?? [0, 0, 0]).map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2 contrast ratio between two hex colours (1–21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Moves a colour's lightness, keeping its hue, until it reaches `min` contrast against `against`. */
function withContrast(hex: string, against: string, min: number, direction: 'darker' | 'lighter'): string {
  let [L, C, H] = rgbToOklch(parseHex(hex)!)
  let out = hex
  for (let i = 0; i < 80 && contrast(out, against) < min; i++) {
    L += direction === 'darker' ? -0.01 : 0.01
    if (L <= 0.03 || L >= 0.985) break
    out = oklch(L, C, H)
  }
  return out
}

/** Darkens by scaling RGB, which keeps a vivid colour's saturation (OKLCH would
 *  have to shed chroma at the sRGB edge, dulling e.g. safety orange). */
function darkenTo(hex: string, against: string, min: number): string {
  const rgb = parseHex(hex)!
  let out = hex
  for (let f = 0.99; f > 0.5 && contrast(out, against) < min; f -= 0.01) out = toHex(rgb.map((v) => v * f))
  return out
}

const shift = (hex: string, dL: number) => {
  const [L, C, H] = rgbToOklch(parseHex(hex)!)
  return oklch(Math.min(0.98, Math.max(0.05, L + dL)), C, H)
}

const WHITE = '#ffffff'
/** Stands in for the photo hero's dark overlay when checking on-dark contrast. */
const OVERLAY = '#16181c'

/** Every colour token the packs, the base CSS and the brand layer read. */
export function buildPalette(brandHex: string, mode: BrandMode): Record<string, string> {
  const brand = toHex(parseHex(brandHex) ?? parseHex('#e85d04')!)
  const [, C, H] = rgbToOklch(parseHex(brand)!)
  // Neutrals carry a whisper of the brand hue so greys never look borrowed
  const n = Math.min(C, 0.02)
  if (mode === 'dark') {
    const bg = oklch(0.17, n * 0.6, H)
    const surface = oklch(0.21, n * 0.7, H)
    const text = oklch(0.96, n * 0.2, H)
    const primary = withContrast(brand, bg, 3, 'lighter')
    return {
      bg, surface, 'surface-2': oklch(0.25, n * 0.8, H), text,
      muted: withContrast(oklch(0.74, n * 0.5, H), surface, 4.5, 'lighter'),
      border: oklch(0.31, n, H), 'border-strong': oklch(0.38, n, H),
      primary, 'primary-hover': shift(primary, 0.06),
      'primary-ink': withContrast(primary, surface, 4.5, 'lighter'),
      'on-primary': contrast(primary, WHITE) >= 3 ? WHITE : oklch(0.16, n, H),
      'accent-on-dark': withContrast(primary, OVERLAY, 4.5, 'lighter'),
      ink: oklch(0.13, n * 0.6, H),
    }
  }
  const surface = oklch(0.975, n * 0.35, H)
  // Bold white button labels need 3:1 — vivid oranges/reds get nudged just past it
  // (they keep their punch); light brands (yellows) keep their colour and get dark text.
  const vsWhite = contrast(brand, WHITE)
  const primary = vsWhite < 3 && vsWhite >= 2.2 ? darkenTo(brand, WHITE, 3) : brand
  return {
    bg: WHITE, surface, 'surface-2': oklch(0.952, n * 0.5, H),
    text: oklch(0.21, n * 0.8, H),
    muted: withContrast(oklch(0.5, n * 0.7, H), surface, 4.5, 'darker'),
    border: oklch(0.905, n * 0.6, H), 'border-strong': oklch(0.84, n * 0.7, H),
    primary, 'primary-hover': shift(primary, -0.06),
    'primary-ink': withContrast(primary, surface, 4.5, 'darker'),
    'on-primary': contrast(primary, WHITE) >= 3 ? WHITE : oklch(0.18, n, H),
    // On the dark photo overlay the untouched brand colour is at its most vivid
    'accent-on-dark': withContrast(brand, OVERLAY, 4.5, 'lighter'),
    ink: oklch(0.19, Math.min(C, 0.025), H),
  }
}

// ─── The kit ─────────────────────────────────────────────────────────────────

export interface BrandKit {
  name: string
  descriptor: string
  initial: string
  mode: BrandMode
  brandHex: string
  pairing: FontPairing
  palette: Record<string, string>
  fontsUrl: string
  heroPhoto: string
  /** Which blocks the landing page uses, in order */
  playbook: Playbook
  /** The hero card's job, e.g. "Find a job: role, location → Search jobs" */
  heroAction: string
  /** International digits for the floating WhatsApp button, '' for none */
  whatsapp: string
}

function fontsUrlFor(p: FontPairing): string {
  const fam = (f: { family: string; weights: number[] }) => `family=${f.family.replace(/ /g, '+')}:wght@${[...new Set(f.weights)].sort((a, b) => a - b).join(';')}`
  const parts = p.heading.family === p.body.family
    ? [fam({ family: p.heading.family, weights: [...p.heading.weights, ...p.body.weights] })]
    : [fam(p.heading), fam(p.body)]
  return `https://fonts.googleapis.com/css2?${parts.join('&')}&display=swap`
}

const field = (brief: string, label: string) =>
  new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, 'im').exec(brief)?.[1]?.trim().replace(/^["'“]|["'”.]$/g, '').trim() ?? ''

/** The monogram letter: the first letter of the name, skipping "The". */
export function logoInitial(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s&'-]/gu, ' ').split(/\s+/).filter(Boolean)
  const word = words.find((w) => !/^(the|a|an)$/i.test(w)) ?? words[0] ?? 'S'
  return word[0].toUpperCase()
}

/**
 * Turns the art director's brief into a kit. Every field has a deterministic
 * fallback (industry keywords → pairing → its default colour), so a thin or
 * failed brief still yields a coherent identity.
 */
export function buildBrandKit(opts: {
  brief: string
  prompt: string
  fallbackName: string
  heroPhoto?: string
  /** A palette preset the client picked in the Builder wins over the brief */
  override?: { brandHex: string; mode: BrandMode }
}): BrandKit {
  const { brief, prompt } = opts
  const text = `${prompt}\n${field(brief, 'DESCRIPTOR')}\n${field(brief, 'REFERENCE')}`
  const askedId = field(brief, 'FONT PAIRING').toLowerCase().match(/[a-z]+/)?.[0] ?? ''
  const pairing = FONT_PAIRINGS.find((p) => p.id === askedId)
    ?? FONT_PAIRINGS.find((p) => p.match.test(text))
    ?? FONT_PAIRINGS.find((p) => p.id === DEFAULT_PAIRING)!
  const briefColor = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i.exec(field(brief, 'BRAND COLOU?R'))?.[0]
  const brandHex = opts.override?.brandHex ?? (briefColor && parseHex(briefColor) ? briefColor.toLowerCase() : pairing.defaultColor)
  const mode: BrandMode = opts.override?.mode ?? (/^dark/i.test(field(brief, 'MODE')) ? 'dark' : 'light')
  const name = field(brief, 'BRAND NAME').replace(/[<>{}`"]/g, '').slice(0, 40) || opts.fallbackName
  const descriptor = field(brief, 'DESCRIPTOR').replace(/[<>{}`"]/g, '').split(/\s+/).slice(0, 4).join(' ').slice(0, 32)
  const playbook = pickPlaybook(`${descriptor}\n${prompt}`, field(brief, 'REFERENCE'))
  const askedAction = field(brief, 'HERO ACTION')
  return {
    name, descriptor, initial: logoInitial(name), mode, brandHex, pairing,
    palette: buildPalette(brandHex, mode),
    fontsUrl: fontsUrlFor(pairing),
    heroPhoto: opts.heroPhoto || `https://picsum.photos/seed/${encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'))}-hero/1920/1080`,
    playbook,
    heroAction: askedAction && !/^none\b/i.test(askedAction) ? askedAction : playbook.heroAction,
    whatsapp: findWhatsApp(prompt),
  }
}

const esc = (s: string) => s.replace(/[<>{}&"]/g, '')

/** The logo's inner markup — monogram tile, wordmark and descriptor. */
export function logoInner(name: string, descriptor: string, flavour: 'jsx' | 'html'): string {
  const cls = flavour === 'jsx' ? 'className' : 'class'
  const tag = descriptor ? `<span ${cls}="brand-tag">${esc(descriptor)}</span>` : ''
  return `<span ${cls}="brand-mark" aria-hidden="true">${logoInitial(name)}</span><span ${cls}="brand-text"><span ${cls}="brand-name">${esc(name)}</span>${tag}</span>`
}

/** An SVG monogram favicon as a data URI (safe inside any attribute). */
export function faviconHref(initial: string, bg: string, fg: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='${bg}'/><text x='32' y='44' text-anchor='middle' font-family='Arial,Helvetica,sans-serif' font-weight='700' font-size='36' fill='${fg}'>${esc(initial)}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export const kitFavicon = (kit: BrandKit) => faviconHref(kit.initial, kit.palette.primary, kit.palette['on-primary'])

// ─── Prompt block ────────────────────────────────────────────────────────────

const TASTE_RULES = `TASTE RULES — what separates a designed site from an AI-made one. Follow every one:
1. ONE brand colour (--primary). Use it only for primary buttons, the single accent line of the hero headline, eyebrows and small highlights. Everything else is neutral (--bg, --surface, --ink). No second accent colour, no rainbow, no colour-coded sections.
2. NO gradient text, ever. Headline accents are solid colour: wrap ONE line or phrase in <span className="accent">.
3. NO decorative blobs, glows, blurred colour orbs, mesh or radial-gradient backdrops, diagonal stripes, corner ribbons, tilted or overlapping images, or neon shadows.
4. No emoji in the logo, headings, nav, buttons or body copy. Icons are simple inline SVG line icons (24×24, stroke="currentColor", fill="none") inside an icon tile.
5. Photography carries the design: real photos, large, object-fit: cover. Never tiny decorative thumbnails.
6. A strong grid: content aligned to the container's left edge, consistent spacing, nothing floating in empty space.
7. Copy sounds like the business: concrete specifics (numbers, places, hours, prices). Banned words: elevate, unleash, unlock, seamless, revolutionize, cutting-edge, state-of-the-art, world-class, next-level, game-changer, "Welcome to", "In today's fast-paced world".
8. Headline 8 words or fewer, subhead 30 words or fewer. Buttons name the action ("Browse jobs", "Book a table") — never "Learn more" or "Click here".
9. Never write font-family, @import, or colour hex codes yourself — use var(--font-heading), var(--font-body) and the colour variables.`

function heroRecipe(kit: BrandKit, flavour: 'jsx' | 'html'): string {
  const c = flavour === 'jsx' ? 'className' : 'class'
  const link = (cls: string, label: string) => flavour === 'jsx'
    ? `<Link ${c}="${cls}" to="«route»">${label}</Link>`
    : `<a ${c}="${cls}" href="«page».html">${label}</a>`
  const close = flavour === 'jsx' ? ' />' : '>'
  return `LANDING HERO — build it EXACTLY in this structure. ForgeAI's stylesheet already styles every class below (layout, overlay, colours, responsive) — do NOT write CSS for them and do NOT add inline styles:
<section ${c}="hero hero-photo">
  <img ${c}="hero-bg" src="${kit.heroPhoto}" alt="«what the photo shows»"${close}
  <div ${c}="hero-inner">
    <div ${c}="hero-copy">
      <span ${c}="hero-eyebrow">«3–5 word category label»</span>
      <h1>«line one» <span ${c}="accent">«accent line»</span> «line three»</h1>
      <p ${c}="hero-lead">«one or two specific sentences»</p>
      <div ${c}="hero-actions">${link('btn btn-primary', '«primary action» →')}${link('btn btn-secondary', '«second action»')}</div>
    </div>
    <aside ${c}="hero-aside">
      «optional: 1–2 live-feeling stat cards» <div ${c}="hero-glass"><span ${c}="hero-glass-icon">«inline SVG icon»</span><div><span ${c}="hero-glass-label">«New roles this week»</span><span ${c}="hero-glass-value">«+12»</span></div></div>
      «the HERO ACTION as a working card» <div ${c}="hero-card"><h3>«${esc(kit.heroAction.split(':')[0] || 'Find a job')}»</h3><form ${c}="hero-form">«2–3 labelled fields»<button type="submit" ${c}="btn btn-primary">«${esc(kit.heroAction.split('→')[1]?.trim() || 'Search jobs')}»</button></form></div>
    </aside>
    <div ${c}="hero-stats">«3–4 of» <div ${c}="hero-stat"><span ${c}="hero-stat-value">«50+»</span><span ${c}="hero-stat-label">«Active roles»</span></div></div>
  </div>
</section>
If the business has no form-like action, the aside holds two hero-glass cards instead of the hero-card. The stats come from HERO PROOF — believable for this business. One phrase of the hero-lead may be a ROTATING WORD (see the block library).

EVERY OTHER PAGE starts with:
<section ${c}="page-hero"><img ${c}="hero-bg" src="«a photo from the PHOTO LIBRARY»" alt=""${close}<div ${c}="container"><span ${c}="eyebrow">«label»</span><h1>«page title»</h1><p>«one specific line»</p></div></section>`
}

/** Appended to the design brief: the fixed identity + taste rules + hero recipe. */
export function brandKitBrief(kit: BrandKit, flavour: 'jsx' | 'html'): string {
  const p = kit.palette
  const h = kit.pairing.heading.family
  const logo = flavour === 'jsx'
    ? `<Link to="/" className="nav-brand" aria-label="${esc(kit.name)} home">${logoInner(kit.name, kit.descriptor, 'jsx')}</Link>`
    : `<a href="index.html" class="nav-brand" aria-label="${esc(kit.name)} home">${logoInner(kit.name, kit.descriptor, 'html')}</a>`
  return `═══ BRAND KIT — fixed by ForgeAI. It OVERRIDES anything above about colours, fonts, logo or hero ═══
BRAND: ${kit.name}${kit.descriptor ? ` — ${kit.descriptor}` : ''}
PALETTE: --bg ${p.bg}; --primary ${p.primary}; --text ${p.text} (${kit.mode} mode)
COLOUR VARIABLES (already defined — always use var(), never hex): --primary (the ONE brand colour) · --primary-hover · --primary-ink (brand colour for small text on light backgrounds) · --on-primary (text on --primary) · --accent-on-dark (brand colour on dark or photo backgrounds) · --bg · --surface · --surface-2 · --text · --muted · --border · --ink (near-black for dark sections) · --on-ink
FONTS (already loaded): headings "${h}"${kit.pairing.headingCase === 'uppercase' ? ' — set in UPPERCASE with tight leading (the stylesheet does this)' : ''}; body "${kit.pairing.body.family}".
LOGO — use exactly this in the header (and the same inner markup for the footer logo):
${logo}
HERO PHOTO: ${kit.heroPhoto}
HERO ACTION: ${kit.heroAction || 'none — use two hero-glass cards'}

${TASTE_RULES}

${heroRecipe(kit, flavour)}

${blocksBrief(kit, flavour)}
═══ END BRAND KIT ═══`
}

// ─── Brand layer CSS ─────────────────────────────────────────────────────────

const LAYER_START = '/* ══ FORGEAI BRAND LAYER ══ */'
const LAYER_END = '/* ══ END FORGEAI BRAND LAYER ══ */'

// A page whose first block is a photo hero gets the header floating over it.
const HERO_FIRST = [
  ':is(header, .site-header) + :is(main, .site-main) > :is(.hero-photo, .page-hero):first-child',
  ':is(header, .site-header) + :is(main, .site-main) > :first-child > :is(.hero-photo, .page-hero):first-child',
  ':is(header, .site-header) + :is(.hero-photo, .page-hero)',
].join(', ')
const TOP_HEADER = ':is(body > header, .site-header)'
const OVER = `body:has(${HERO_FIRST}) ${TOP_HEADER}`

export function brandLayerCss(kit: BrandKit): string {
  const p = kit.palette
  const f = kit.pairing
  const r = RADII[f.shape]
  const dark = kit.mode === 'dark'
  const shadow = dark ? '0,0,0' : '16,18,22'
  const vars = Object.entries(p).map(([k, v]) => `  --${k}: ${v};`).join('\n')
  return `${LAYER_START}
:root {
${vars}
  --text-muted: ${p.muted};
  --secondary: ${p.ink};
  --accent: ${p.primary};
  --on-ink: #ffffff;
  --primary-soft: color-mix(in srgb, ${p.primary} 10%, ${p.bg});
  --font-heading: '${f.heading.family}', ${f.heading.fallback};
  --font-display: '${f.heading.family}', ${f.heading.fallback};
  --font-body: '${f.body.family}', ${f.body.fallback};
  --heading-case: ${f.headingCase};
  --heading-weight: ${f.headingWeight};
  --heading-tracking: ${f.headingTracking};
  --heading-leading: ${f.headingLeading};
  --radius-xs: ${r.sm}; --radius-sm: ${r.sm}; --radius: ${r.base}; --radius-lg: ${r.lg}; --radius-xl: ${r.xl}; --btn-radius: ${r.btn};
  --shadow-sm: 0 1px 2px rgba(${shadow},.06), 0 1px 3px rgba(${shadow},.08);
  --shadow: 0 6px 18px -6px rgba(${shadow},.16), 0 2px 4px rgba(${shadow},.05);
  --shadow-lg: 0 18px 42px -16px rgba(${shadow},.24), 0 4px 10px rgba(${shadow},.06);
  --shadow-xl: 0 30px 70px -24px rgba(${shadow},.32);
  --ring: 0 0 0 3px color-mix(in srgb, ${p.primary} 30%, transparent);
}
body { font-family: var(--font-body); background: var(--bg); color: var(--text); }

/* Typography — one pairing, set the same way on every page */
:is(h1, h2, h3, h4, .hero-title, .section-title, .stat-value, .stat-number, .price) { font-family: var(--font-heading) !important; }
:is(h1, h2) { text-transform: var(--heading-case) !important; letter-spacing: var(--heading-tracking) !important; font-weight: var(--heading-weight) !important; }
h1 { line-height: var(--heading-leading); }
h2 { line-height: calc(var(--heading-leading) + .06); }
:is(.eyebrow, .section-label) { color: var(--primary-ink); }
:where(p, li):not(header *, nav *, footer *) > a:not([class]) { color: var(--primary-ink); text-decoration: underline; text-underline-offset: 3px; }

/* Accent: solid brand colour — gradient text is banned */
:is(.accent, .text-accent, .gradient-text, .text-gradient) {
  background: none !important; -webkit-background-clip: border-box !important; background-clip: border-box !important;
  -webkit-text-fill-color: currentColor !important; color: var(--primary-ink) !important; padding: 0 !important; box-shadow: none !important; text-shadow: none !important;
}
:is(.hero-photo, .page-hero, .cta-section, footer, .site-footer) :is(.accent, .text-accent, .gradient-text, .text-gradient) { color: var(--accent-on-dark) !important; }

/* Icon lists: an item that starts with an inline icon is an icon + text row
   (zero specificity — any styling the page wrote for its list wins) */
:where(ul:has(> li > svg:first-child)) { list-style: none; padding-left: 0; }
:where(li:has(> svg:first-child)) { display: flex; align-items: flex-start; gap: .65rem; }
:where(li > svg:first-child) { flex-shrink: 0; margin-top: .2em; color: var(--primary-ink); }

/* Buttons */
:is(.btn, .btn-primary, .btn-secondary, .btn-ghost, .nav-cta, .cta-btn) { border-radius: var(--btn-radius) !important; font-weight: 700; text-decoration: none !important; }
:is(.btn-primary, .btn.primary, .nav-cta, .cta-btn) { background: var(--primary) !important; border-color: var(--primary) !important; color: var(--on-primary) !important; box-shadow: none !important; }
:is(.btn-primary, .btn.primary, .nav-cta, .cta-btn):hover { background: var(--primary-hover) !important; border-color: var(--primary-hover) !important; transform: translateY(-1px); opacity: 1; }

/* Logo — monogram tile + wordmark + descriptor */
:is(header, .site-header, footer, .site-footer) :is(.nav-brand, .logo, .brand, .navbar-brand, .site-logo, .footer-logo):has(.brand-mark) { display: inline-flex !important; align-items: center !important; gap: .7rem !important; text-decoration: none !important; }
.brand-mark { display: inline-grid !important; place-items: center; width: 42px; height: 42px; flex-shrink: 0; border-radius: calc(var(--radius-sm) + 2px); background: var(--primary); color: var(--on-primary) !important; font-family: var(--font-heading); font-weight: 800; font-size: 1.4rem; line-height: 1; text-transform: uppercase; letter-spacing: 0; box-shadow: inset 0 -3px 0 rgba(0,0,0,.16); }
.brand-text { display: flex; flex-direction: column; justify-content: center; gap: .3rem; line-height: 1; min-width: 0; }
.brand-name { font-family: var(--font-heading); font-weight: var(--heading-weight); font-size: 1.3rem; line-height: 1; letter-spacing: var(--heading-tracking); text-transform: var(--heading-case); color: var(--text); white-space: nowrap; }
.brand-tag { font-family: var(--font-body); font-size: .6rem; font-weight: 600; letter-spacing: .24em; text-transform: uppercase; color: var(--muted); white-space: nowrap; }
:is(footer, .site-footer) .brand-name { color: inherit; }
:is(footer, .site-footer) .brand-tag { color: inherit; opacity: .6; }
@media (max-width: 480px) { .brand-tag { display: none; } .brand-mark { width: 36px; height: 36px; font-size: 1.2rem; } }

/* Header — links grouped on the right next to the call to action. Models often
   wrap logo + links + button in ONE <nav>; that wrapper is a plain full-width row. */
${TOP_HEADER} > :is(nav, div, .container):has(.nav-brand, .brand-mark) { flex: 1 1 auto !important; display: flex !important; align-items: center !important; gap: 1.5rem !important; width: auto !important; max-width: none !important; margin: 0 !important; padding: 0 !important; position: static !important; background: transparent !important; box-shadow: none !important; border: 0 !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
@media (min-width: 821px) {
  ${TOP_HEADER} :is(nav, .nav-links, .nav-menu):not(:has(.nav-brand, .brand-mark)) { margin-left: auto !important; flex: 0 1 auto !important; justify-content: flex-end !important; }
  /* The header owns the background; a frosted panel on the inner nav reads as a stray box */
  ${TOP_HEADER} :is(nav, .nav-links, .nav-menu) { background: transparent !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; box-shadow: none !important; border: 0 !important; position: static !important; }
}
/* :not(#_) only lifts specificity above the packs' !important "nav a" colour rules */
:is(header, .site-header) .nav-cta:not(#_) { background: var(--primary) !important; color: var(--on-primary) !important; padding: .7rem 1.25rem !important; font-size: .92rem !important; border: 0 !important; }
:is(header, .site-header) .nav-cta:not(#_):hover { background: var(--primary-hover) !important; color: var(--on-primary) !important; }
/* ForgeAI injects the one working menu button (.nav-toggle); hide model-made extras.
   It is an icon, not a button — the base "button" style must not paint it. */
${TOP_HEADER} :is(.mobile-toggle, .menu-toggle, .mobile-menu-toggle, .mobile-menu-btn, .menu-btn, .hamburger, .burger, .nav-burger):not(.nav-toggle) { display: none !important; }
.nav-toggle:not(#_) { background: transparent !important; box-shadow: none !important; padding: 0 !important; border: 0 !important; border-radius: 8px !important; transform: none !important; }
@media (max-width: 820px) {
  /* One header row on phones: logo left, menu right; the hero carries the calls to action */
  ${TOP_HEADER} { flex-wrap: nowrap !important; }
  ${TOP_HEADER} > .nav-cta:not(#_) { display: none !important; }
  ${TOP_HEADER} > .nav-toggle { margin-left: auto !important; }
  ${TOP_HEADER} nav:has(.nav-brand, .brand-mark) { flex-direction: row !important; max-height: none !important; opacity: 1 !important; pointer-events: auto !important; overflow: visible !important; }
  ${TOP_HEADER} nav:has(.nav-brand, .brand-mark) > :is(.nav-links, .nav-menu, ul) { display: flex !important; flex-direction: column !important; align-items: stretch !important; gap: 0 !important; position: absolute !important; top: 100%; left: 0; right: 0; margin: 0 !important; padding: 0 !important; background: color-mix(in srgb, var(--bg) 97%, transparent) !important; border: 0 !important; box-shadow: 0 20px 40px -16px rgba(0,0,0,.35); max-height: 0; overflow: hidden; opacity: 0; pointer-events: none; z-index: 190; transition: max-height .35s ease, opacity .3s ease; }
  ${TOP_HEADER} nav.nav-open:has(.nav-brand, .brand-mark) > :is(.nav-links, .nav-menu, ul) { max-height: 78vh; overflow-y: auto; opacity: 1; pointer-events: auto; padding: .5rem 0 1rem !important; border-top: 1px solid var(--border) !important; }
  ${TOP_HEADER} nav:has(.nav-brand, .brand-mark) > :is(.nav-links, .nav-menu, ul) a:not(#_) { display: flex !important; align-items: center; min-height: 48px; padding: .8rem 1.5rem !important; border-bottom: 1px solid var(--border) !important; color: var(--text) !important; width: 100%; }
  ${TOP_HEADER} nav:has(.nav-brand, .brand-mark) > .nav-cta { display: none !important; }
  /* The menu-row styling for "header nav a" must not reach the logo */
  ${TOP_HEADER} :is(.nav-brand, .logo, .brand, .navbar-brand, .site-logo):has(.brand-mark):not(#_) { width: auto !important; min-height: 0 !important; padding: 0 !important; border: 0 !important; background: transparent !important; }
}

/* Header floats over a photo hero, turns solid on scroll */
${OVER} { position: fixed !important; top: 0; left: 0; right: 0; z-index: 100; }
${OVER}:not(.scrolled) { background: transparent !important; border-bottom-color: transparent !important; box-shadow: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
${OVER}:not(.scrolled) .brand-name { color: #fff !important; }
${OVER}:not(.scrolled) .brand-tag { color: rgba(255,255,255,.72) !important; }
${OVER}:not(.scrolled) .nav-toggle span { background: #fff !important; }
${OVER}.scrolled { background: color-mix(in srgb, var(--bg) 95%, transparent) !important; backdrop-filter: blur(14px) !important; -webkit-backdrop-filter: blur(14px) !important; border-bottom: 1px solid var(--border) !important; }
@media (min-width: 821px) {
  ${OVER}:not(.scrolled) :is(nav, .nav-links) a:not(.nav-cta):not([class*="btn"]) { color: rgba(255,255,255,.86) !important; }
  ${OVER}:not(.scrolled) :is(nav, .nav-links) a:not(.nav-cta):not([class*="btn"]):is(:hover, .active, [aria-current]) { color: #fff !important; }
}

/* ── Photo hero ── */
:is(.hero-photo, .page-hero)::before { content: none !important; }
.hero-photo { position: relative !important; overflow: hidden; display: flex !important; align-items: center; min-height: 640px; min-height: min(100svh, 920px); padding: clamp(124px, 13vw, 160px) 0 clamp(40px, 5vw, 56px) !important; text-align: left !important; background: ${p.ink} !important; color: #fff; }
:is(.hero-photo, .page-hero) > .hero-bg { position: absolute !important; inset: 0; width: 100% !important; height: 100% !important; max-width: none !important; object-fit: cover; z-index: 0 !important; border-radius: 0 !important; margin: 0 !important; }
.hero-photo::after, .hero-photo:has(.hero-bg)::after { content: '' !important; position: absolute; inset: 0; z-index: 1 !important; pointer-events: none; background: linear-gradient(100deg, rgba(10,11,13,.9) 0%, rgba(10,11,13,.74) 42%, rgba(10,11,13,.4) 100%), linear-gradient(0deg, rgba(10,11,13,.6) 0%, rgba(10,11,13,0) 38%) !important; }
:where(.hero-photo, .page-hero) > :where(:not(.hero-bg)) { position: relative; z-index: 2; }
.hero-photo .hero-inner { width: 100%; max-width: var(--maxw, 1200px); margin: 0 auto; padding-inline: clamp(20px, 5vw, 40px); display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(300px, .75fr); gap: clamp(1.75rem, 4vw, 4rem); align-items: center; }
.hero-photo .hero-inner:not(:has(.hero-aside)) { grid-template-columns: minmax(0, 1fr); }
.hero-photo .hero-copy { max-width: 760px; }
.hero-photo .hero-copy > * { margin-inline: 0 !important; }
.hero-photo .hero-copy :is(.hero-eyebrow, .eyebrow) { display: inline-flex; align-items: center; gap: .6rem; padding: .45rem 1rem; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--accent-on-dark) 55%, transparent); background: color-mix(in srgb, var(--accent-on-dark) 12%, transparent); color: var(--accent-on-dark) !important; font-size: .76rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; margin: 0 0 1.4rem !important; }
.hero-photo .hero-copy :is(.hero-eyebrow, .eyebrow)::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-on-dark) 25%, transparent); }
.hero-photo .hero-copy h1 { color: #fff !important; font-size: clamp(2.6rem, 6vw, 5.2rem); line-height: var(--heading-leading); max-width: 17ch; margin: 0 0 1.4rem !important; text-wrap: balance; }
.hero-photo .hero-copy :is(.hero-lead, .hero-subtitle, p) { color: rgba(255,255,255,.86) !important; font-size: clamp(1.05rem, 1.45vw, 1.25rem); line-height: 1.6; max-width: 54ch; margin: 0 0 2rem !important; }
.hero-photo .hero-actions { display: flex; flex-wrap: wrap; gap: .9rem; justify-content: flex-start !important; }
.hero-photo .hero-actions a:is(.btn, .btn-primary, .btn-secondary, .btn-ghost) { padding: 1rem 1.7rem; font-size: 1.02rem; text-decoration: none !important; }
.hero-photo .hero-actions a.btn-primary { color: var(--on-primary) !important; }
.hero-photo :is(.btn-secondary, .btn-ghost) { background: transparent !important; color: #fff !important; border: 1.5px solid rgba(255,255,255,.42) !important; }
.hero-photo :is(.btn-secondary, .btn-ghost):hover { background: rgba(255,255,255,.08) !important; border-color: #fff !important; }
.hero-photo .hero-aside { display: grid; gap: .9rem; }
.hero-photo .hero-glass { display: flex; align-items: center; gap: 1rem; padding: 1.1rem 1.25rem; border-radius: var(--radius-lg); background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.15); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
.hero-photo .hero-glass .hero-glass-icon { display: grid; place-items: center; width: 48px; height: 48px; flex-shrink: 0; border-radius: var(--radius); background: color-mix(in srgb, var(--accent-on-dark) 20%, transparent); color: var(--accent-on-dark) !important; font-size: 1.4rem; }
.hero-photo .hero-glass .hero-glass-icon svg { width: 24px; height: 24px; }
.hero-photo .hero-glass .hero-glass-label { display: block; font-size: .74rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,.72) !important; margin: 0 0 .3rem; }
.hero-photo .hero-glass .hero-glass-value { display: block; font-family: var(--font-heading); font-weight: var(--heading-weight); font-size: clamp(1.6rem, 2.6vw, 2.2rem); line-height: 1; color: var(--accent-on-dark) !important; margin: 0; }
.hero-photo .hero-card { background: var(--bg); border-radius: var(--radius-lg); padding: clamp(1.25rem, 2.4vw, 1.85rem); box-shadow: 0 30px 80px -24px rgba(0,0,0,.6); text-align: left; }
.hero-photo .hero-card, .hero-photo .hero-card *:not(.btn):not(.btn-primary):not(button):not(.accent) { color: var(--text) !important; }
.hero-photo .hero-card :is(h2, h3) { font-family: var(--font-heading) !important; font-size: clamp(1.15rem, 1.6vw, 1.4rem); text-transform: var(--heading-case); letter-spacing: var(--heading-tracking); margin: 0 0 1rem; }
.hero-photo .hero-card :is(form, .hero-form) { display: grid; gap: .75rem; margin: 0; }
.hero-photo .hero-card label { color: var(--muted) !important; font-size: .8rem; margin: 0 0 .3rem; }
.hero-photo .hero-card :is(input, select, textarea) { background: var(--surface) !important; border: 1px solid var(--border) !important; color: var(--text) !important; min-height: 50px; }
.hero-photo .hero-card :is(.btn, .btn-primary, button[type="submit"]) { width: 100%; justify-content: center; min-height: 52px; background: var(--primary) !important; color: var(--on-primary) !important; border-color: var(--primary) !important; }
.hero-photo .hero-stats { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: clamp(1.5rem, 4.5vw, 3.75rem); margin-top: clamp(1.75rem, 4vw, 3rem); padding-top: clamp(1.25rem, 2.4vw, 1.75rem); border-top: 1px solid rgba(255,255,255,.16); }
.hero-photo .hero-stats .hero-stat-value { display: block; font-family: var(--font-heading); font-weight: var(--heading-weight); text-transform: var(--heading-case); font-size: clamp(1.9rem, 3.4vw, 2.8rem); line-height: 1; color: var(--accent-on-dark) !important; margin: 0; }
.hero-photo .hero-stats .hero-stat-label { display: block; margin: .4rem 0 0; font-size: .9rem; color: rgba(255,255,255,.72) !important; }
@media (max-width: 960px) {
  .hero-photo { min-height: 0; padding-top: 112px !important; }
  .hero-photo .hero-inner { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 560px) {
  .hero-photo .hero-copy h1 { font-size: clamp(2.3rem, 11vw, 3.2rem); }
  .hero-photo .hero-actions a:is(.btn, .btn-primary, .btn-secondary) { flex: 1 1 100%; }
  .hero-photo .hero-stats { display: grid; grid-template-columns: 1fr 1fr; }
}

/* ── Inner page hero ── */
.page-hero { position: relative !important; overflow: hidden; background: var(--ink) !important; color: #fff; padding: clamp(128px, 13vw, 164px) 0 clamp(52px, 7vw, 84px) !important; text-align: left !important; }
.page-hero:has(.hero-bg)::after { content: ''; position: absolute; inset: 0; z-index: 1; pointer-events: none; background: linear-gradient(100deg, rgba(10,11,13,.88) 0%, rgba(10,11,13,.6) 100%); }
.page-hero .container { text-align: left !important; }
.page-hero .container > * { margin-inline: 0 !important; }
.page-hero :is(h1, .page-title) { color: #fff !important; font-size: clamp(2.3rem, 5.2vw, 4rem); max-width: 20ch; margin: .2rem 0 1rem !important; }
.page-hero p { color: rgba(255,255,255,.82) !important; max-width: 60ch; font-size: clamp(1.02rem, 1.4vw, 1.2rem); margin: 0 !important; }
.page-hero :is(.eyebrow, .hero-eyebrow) { color: var(--accent-on-dark) !important; }

${BLOCKS_CSS}
${LAYER_END}`
}

// ─── Taste guard ─────────────────────────────────────────────────────────────

const HEADING_SELECTOR = /(^|[\s>+~,(])h[1-6]\b|title|heading|headline|display|brand|logo|stat-(value|number)|price/i

/**
 * Lints AI-written CSS against the taste rules: gradient text becomes plain
 * text, large blurred decorations (colour blobs) are removed, hard-coded fonts
 * are pointed at the kit's pairing, and rules aimed at block-library (`kit-`)
 * classes are dropped — the blocks' layout belongs to ForgeAI.
 */
export function applyTasteGuard(css: string): string {
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (whole, selector: string, body: string) => {
    const sel = (selector.replace(/\/\*[\s\S]*?\*\//g, '').split(';').pop() ?? '').trim()
    if (!sel || /@font-face|@page/i.test(sel) || /^(from|to|[\d.]+%)(\s*,\s*([\d.]+%|from|to))*$/i.test(sel)) return whole
    if (/\.kit-[\w-]/.test(sel)) {
      const at = selector.lastIndexOf(sel)
      return at >= 0 ? selector.slice(0, at) : ''
    }
    let decls = body
    if (/background-clip\s*:\s*text|-webkit-text-fill-color\s*:\s*transparent/i.test(decls)) {
      decls = decls
        .replace(/(-webkit-)?background-clip\s*:\s*text\s*(!important)?\s*;?/gi, '')
        .replace(/-webkit-text-fill-color\s*:\s*transparent\s*(!important)?\s*;?/gi, '')
        .replace(/(^|;)\s*background(-image)?\s*:[^;]*gradient\([^;]*;?/gi, '$1')
        .replace(/(^|;)\s*color\s*:\s*transparent\s*(!important)?\s*;?/gi, '$1')
    }
    const blur = /(?:^|[;\s])filter\s*:[^;]*blur\(\s*([\d.]+)px/i.exec(decls)
    if (blur && Number(blur[1]) >= 24) {
      decls = `${decls.replace(/;?\s*$/, '')};${/::?(before|after)\b/i.test(sel) ? 'content:none!important' : 'display:none!important'}`
    }
    decls = decls.replace(/(^|[;\s])font-family\s*:\s*([^;!}]+)(!important)?/gi, (m, pre: string, value: string, imp?: string) => {
      if (/var\(|inherit|initial|unset|monospace|Menlo|Consolas|Courier/i.test(value)) return m
      return `${pre}font-family: ${HEADING_SELECTOR.test(sel) ? 'var(--font-heading)' : 'var(--font-body)'}${imp ? ' !important' : ''}`
    })
    return decls === body ? whole : `${selector}{${decls}}`
  })
}

/**
 * Puts a stylesheet in its final shape: Google Font imports other than the
 * kit's are dropped (one pairing per site), the taste guard runs over the AI
 * rules, and the brand layer is (re)appended LAST. Idempotent — QA passes that
 * append CSS after it simply get it moved back to the end.
 */
export function finalizeBrandCss(css: string, kit: BrandKit, opts: { fontImport: boolean }): string {
  let body = css
  for (let a = body.indexOf(LAYER_START); a >= 0; a = body.indexOf(LAYER_START)) {
    const b = body.indexOf(LAYER_END, a)
    body = b < 0 ? body.slice(0, a) : body.slice(0, a) + body.slice(b + LAYER_END.length)
  }
  const lines = body.split('\n')
  const imports = lines.filter((l) => /^\s*@import\b/.test(l)).map((l) => l.trim()).filter((l) => !/fonts\.googleapis\.com/i.test(l))
  const rest = lines.filter((l) => !/^\s*@import\b/.test(l)).join('\n')
  const top = [...new Set([...(opts.fontImport ? [`@import url('${kit.fontsUrl}');`] : []), ...imports])]
  return `${top.length ? `${top.join('\n')}\n\n` : ''}${applyTasteGuard(rest).trimEnd()}\n\n${brandLayerCss(kit)}\n`
}

/**
 * Inline SVG icons (the taste rules ask for them) often come without width or
 * height, and the base `svg { max-width: 100%; height: auto }` then stretches a
 * 24×24 check mark across its whole container. Icon-sized viewBoxes get a 1.25em
 * default as attributes — presentational hints, so any CSS sizing still wins.
 */
export function sizeInlineIcons(markup: string): string {
  return markup.replace(/<svg\b([^>]*)>/g, (tag, attrs: string) => {
    if (/\s(width|height)=/.test(attrs)) return tag
    const vb = /viewBox=["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)\s*["']/.exec(attrs)
    if (!vb || Number(vb[1]) > 64 || Number(vb[2]) > 64) return tag
    const ratio = Number(vb[1]) / Math.max(1, Number(vb[2]))
    return `<svg width="${(1.25 * ratio).toFixed(2).replace(/\.?0+$/, '')}em" height="1.25em"${attrs}>`
  })
}

/** Static pages: the kit's fonts, the monogram favicon, and the logo in the header. */
export function applyBrandToHtml(html: string, kit: BrandKit): string {
  let out = html
  if (!out.includes(kit.fontsUrl)) {
    out = out.replace(/[ \t]*<link[^>]+fonts\.googleapis\.com\/css2?\?[^>]*>\s*/gi, '')
    out = out.replace(/<\/head>/i, `  <link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  <link rel="stylesheet" href="${kit.fontsUrl}">\n</head>`)
  }
  // Quoted attribute values may hold raw < > (emoji favicons: href="data:image/svg+xml,<svg …>")
  const attrs = `(?:[^>"']|"[^"]*"|'[^']*')*`
  out = out.replace(new RegExp(`[ \\t]*<link\\b${attrs}rel=["'](?:shortcut )?icon["']${attrs}>\\s*`, 'gi'), '')
  out = out.replace(/<\/head>/i, `  <link rel="icon" href="${kitFavicon(kit)}">\n</head>`)
  // The header logo becomes the monogram unless the brand supplied a real one
  out = out.replace(
    /(<header\b(?:(?!<\/header>)[\s\S])*?<a\b[^>]*class=["'][^"']*\b(?:nav-brand|logo|brand|navbar-brand|site-logo)\b[^"']*["'][^>]*>)((?:(?!<\/header>)[\s\S])*?)(<\/a>)/i,
    (m, open: string, inner: string, close: string) => (/<(img|svg)\b|brand-mark/i.test(inner) ? m : `${open}${logoInner(kit.name, kit.descriptor, 'html')}${close}`),
  )
  return applyKitExtras(sizeInlineIcons(out), kit)
}
