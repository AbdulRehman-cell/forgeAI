// The section registry. Adding a section = adding one file under blocks/ and
// listing it here; its CSS, prompt text and renderer all ride along.

import { SectionDef } from './markup'
import { FOUNDATION_CSS } from './foundation'
import { HEROES, HEROES_CSS } from './heroes'
import { trust } from './blocks/trust'
import { logos } from './blocks/logos'
import { features } from './blocks/features'
import { steps } from './blocks/steps'
import { split } from './blocks/split'
import { cards } from './blocks/cards'
import { stats } from './blocks/stats'
import { gallery } from './blocks/gallery'
import { quotes } from './blocks/quotes'
import { faq } from './blocks/faq'
import { duo } from './blocks/duo'
import { pricing } from './blocks/pricing'
import { menu } from './blocks/menu'
import { team } from './blocks/team'
import { timeline } from './blocks/timeline'
import { comparison } from './blocks/comparison'
import { contact } from './blocks/contact'
import { newsletter } from './blocks/newsletter'
import { cta } from './blocks/cta'

export const SECTIONS: SectionDef[] = [
  trust, logos, features, steps, split, cards, stats, gallery, quotes, faq,
  duo, pricing, menu, team, timeline, comparison, contact, newsletter, cta,
]

export const sectionByType = (type: string) => SECTIONS.find((s) => s.type === type)

export const ownsTone = (def: SectionDef, variant: string) =>
  def.ownTone === true || (Array.isArray(def.ownTone) && def.ownTone.includes(variant))

// Marker classes with no rules of their own still count as styled, so the
// "unstyled classes" passes never ask the AI to style ForgeAI's sections
const MARKERS = [
  ...new Set([
    ...SECTIONS.flatMap((s) => [`kit-sec-${s.type}`, ...Object.keys(s.variants).map((v) => `kit-v-${v}`)]),
    ...HEROES.map((h) => `kit-hero-${h.layout}`),
    'kit-intro-split', 'kit-intro-collage', 'kit-intro-copy', 'kit-story-lead', 'kit-person', 'kit-feature-body', 'kit-stat', 'kit-menu-group', 'hero-stat',
  ]),
].map((c) => `.${c}`)

export const SECTIONS_CSS = [
  FOUNDATION_CSS,
  ...SECTIONS.map((s) => s.css),
  HEROES_CSS,
  `:where(${MARKERS.join(', ')}) { --kit-marker: 1; }\n`,
].join('\n')

export { HEROES }
