// ─── ForgeAI industry playbooks + page extras ───────────────────────────────
// Every section after the hero comes from the section registry (sections/):
// the AI writes content, ForgeAI renders the markup. An industry playbook
// decides which sections a landing page uses and in what order, so a salon
// reads like a salon and a recruiter like a recruiter.

import type { BrandKit } from './brandKit'
import { SECTIONS_CSS } from './sections/registry'
import type { Slot } from './sections/siteTypes'

export interface Playbook {
  id: string
  label: string
  /** Keyword fallback when the art director named no industry */
  match: RegExp
  /** Used when the art director gave no HERO ACTION */
  heroAction: string
  /** Openers that suit this industry */
  heroes: string[]
  /** Landing page sections after the hero, in order */
  sections: Slot[]
  pages: string
}

const CLOSE: Slot = { type: 'cta', note: 'closing band with the two main actions' }

// Keyword fallback order matters: specific trades before broad words like "shop"
// or "app", professional services before property ("property disputes" is a law
// firm). Every keyword starts at a word boundary — "browse" is not a brow salon.
export const PLAYBOOKS: Playbook[] = [
  {
    id: 'recruitment', label: 'Recruitment & staffing',
    match: /\b(recruit|staffing|temp work|job board|hiring agency|employment agency|warehouse jobs|placements?\b)/i,
    heroAction: 'Find a job: role or keyword, location → Search jobs',
    heroes: ['search', 'action', 'split'],
    sections: [
      { type: 'trust', note: '4 reasons candidates and employers trust you (pay, compliance, speed, local)' },
      { type: 'steps', note: 'how it works: register → get matched → start work → get paid' },
      { type: 'cards', note: '3–6 live roles: badge = shift type, meta = [location, hours], price = pay, button "Apply", "link" = View all jobs; no photos', variants: ['grid', 'list'] },
      { type: 'duo', note: 'candidates panel and employers panel' },
      { type: 'stats', note: 'placements, employer partners, locations, average start time' },
      { type: 'quotes', note: 'workers and employers' },
      { type: 'faq', note: 'pay, contracts, licences, how fast you start' },
      CLOSE,
    ],
    pages: 'Jobs page: cards for every role. Employers page: features + steps + contact. Contact page: contact.',
  },
  {
    id: 'beauty', label: 'Salon, spa & beauty',
    match: /\b(salons?|barbers?|spa|beauty|nails?|lash(es)?|eyebrows?|brows|skin ?care|aesthetics?|make-?up|hair)\b/i,
    heroAction: 'Book an appointment: service, date → Check availability',
    heroes: ['mosaic', 'split', 'centered', 'action'],
    sections: [
      { type: 'cards', note: 'signature services: photo, meta = [duration], price, button "Book"', variants: ['grid', 'overlay'] },
      { type: 'split', note: 'the space and the team' },
      { type: 'pricing', note: 'price list of the most-booked services', variants: ['list'] },
      { type: 'gallery', note: '5 photos of work and the salon' },
      { type: 'quotes', note: 'clients' },
      { type: 'faq', note: 'booking, cancellations, aftercare' },
      CLOSE,
    ],
    pages: 'Services page: cards grouped by category + pricing (list). About page: split + team + quotes. Contact page: contact with opening hours.',
  },
  {
    id: 'health', label: 'Clinic & healthcare',
    match: /\b(clinics?|dental|dentists?|medical|doctors?|physio|therapy|therapists?|health ?care|pharmacy|opticians?|vets?\b|veterinar|hospitals?)/i,
    heroAction: 'Book an appointment: treatment, preferred date → Request appointment',
    heroes: ['split', 'action', 'centered'],
    sections: [
      { type: 'trust', note: 'accreditations, insurance accepted, years of care, patient rating' },
      { type: 'features', note: 'treatments, each with an icon' },
      { type: 'steps', note: 'your first visit, step by step' },
      { type: 'split', note: 'the clinicians and the practice' },
      { type: 'quotes', note: 'patients' },
      { type: 'faq', note: 'costs, insurance, first appointment, emergencies' },
      CLOSE,
    ],
    pages: 'Treatments page: cards + pricing (list). Team page: team + split. Contact page: contact with hours and a map.',
  },
  {
    id: 'trades', label: 'Trades & home services',
    match: /\b(plumb|electricians?|electrical|roof(ing|ers?)?\b|landscap|garden (care|maintenance|services?|design)|gardeners?|gardening|lawns?\b|cleaning|cleaners?|handyman|builders|home builders?|building contractors?|construction|renovat|hvac|pest control|locksmiths?|painters? and decorators?|decorating|carpent|auto repair|mechanics?|garages?|removals?)/i,
    heroAction: 'Get a free quote: service, postcode → Get my quote',
    heroes: ['action', 'split', 'centered'],
    sections: [
      { type: 'trust', note: 'insured, years trading, rating, workmanship guarantee' },
      { type: 'features', note: 'services, each with an icon' },
      { type: 'steps', note: 'quote → schedule → job done → aftercare' },
      { type: 'gallery', note: 'recent jobs' },
      { type: 'quotes', note: 'local customers' },
      { type: 'faq', note: 'pricing, call-outs, guarantees, areas covered' },
      CLOSE,
    ],
    pages: 'Services page: features + split per service. Areas page: cards of towns covered. Contact page: contact.',
  },
  {
    id: 'food', label: 'Restaurant, café & bakery',
    match: /\b(restaurants?|caf[eé]s?|coffee|baker(y|ies|s)?|bistro|takeaway|pizza|grill|kitchen|food|patisserie|catering|brunch|bars?\b|brewer)/i,
    heroAction: 'Book a table: date, time, guests → Find a table',
    heroes: ['centered', 'mosaic', 'action', 'split'],
    sections: [
      { type: 'cards', note: 'signature dishes or bakes with photo, short description and price', variants: ['grid', 'overlay'] },
      { type: 'split', note: 'the story: the people, the craft, the ingredients' },
      { type: 'gallery', note: '5 photos: food, room, people' },
      { type: 'quotes', note: 'guests' },
      { type: 'contact', note: 'opening hours, address, phone, with the booking or order form' },
      CLOSE,
    ],
    pages: 'Menu page: menu (every dish in groups, with prices). About page: split + gallery + team. Contact or visit page: contact with a map.',
  },
  {
    id: 'hospitality', label: 'Hotel, travel & venues',
    match: /\b(hotels?|resorts?|guest ?house|b&b|hostels?|lodges?|villas?|travel|tours?|holidays?|safaris?|venues?|weddings?)\b/i,
    heroAction: 'Check availability: check-in, check-out, guests → Check availability',
    heroes: ['centered', 'search', 'mosaic'],
    sections: [
      { type: 'cards', note: 'rooms or packages with photo, meta = [guests, size], price per night', variants: ['grid', 'overlay'] },
      { type: 'features', note: 'amenities' },
      { type: 'gallery', note: '6 photos' },
      { type: 'quotes', note: 'guests' },
      { type: 'contact', note: 'location, how to get there, enquiry form', variants: ['map', 'split'] },
      CLOSE,
    ],
    pages: 'Rooms page: cards. Experiences page: split per experience + gallery. Contact page: contact with a map.',
  },
  {
    id: 'professional', label: 'Professional services',
    match: /\b(law\b|legal|solicitors?|attorneys?|lawyers?|accountan|accounting|bookkeep|tax\b|audit|consult|advisory|financial|insurance|marketing agency|digital agency)/i,
    heroAction: 'Book a consultation: service, name, email → Request a call',
    heroes: ['split', 'statement', 'centered'],
    sections: [
      { type: 'features', note: 'services or practice areas' },
      { type: 'split', note: 'why clients choose you: the team and the approach' },
      { type: 'stats', note: 'clients, years, cases or savings, rating' },
      { type: 'quotes', note: 'clients' },
      { type: 'faq', note: 'fees, process, first meeting' },
      CLOSE,
    ],
    pages: 'Services page: split per service + comparison. Team page: team. Contact page: contact.',
  },
  {
    id: 'property', label: 'Real estate',
    match: /\b(real estate|estate agen|realt|propert(y|ies)|lettings?|(homes?|houses?|flats?|plots?|apartments?) (for|to) (sale|rent|let)|selling (homes|houses)|apartments?)\b/i,
    heroAction: 'Find a property: location, type, budget → Search',
    heroes: ['search', 'action', 'split'],
    sections: [
      { type: 'cards', note: 'featured listings: photo, badge (For sale / To let), meta = [beds, baths], price, "link" = View all properties', variants: ['grid', 'overlay'] },
      { type: 'steps', note: 'how buying or renting works with you' },
      { type: 'stats', note: 'homes sold, average days to sell, areas, rating' },
      { type: 'duo', note: 'buyers panel and sellers/landlords panel' },
      { type: 'quotes', note: 'clients' },
      CLOSE,
    ],
    pages: 'Listings page: cards. Valuation page: steps + contact. Contact page: contact with a map.',
  },
  {
    id: 'education', label: 'School & education',
    match: /\b(schools?|academy|nursery|kindergarten|tutors?|tuition|college|university|courses?|training (centre|center|institute)|education|e-?learning)\b/i,
    heroAction: 'Book a visit: programme, name, phone → Book my visit',
    heroes: ['split', 'centered', 'action'],
    sections: [
      { type: 'features', note: 'programmes or subjects' },
      { type: 'stats', note: 'students, results, teachers, years' },
      { type: 'split', note: 'the campus and the teachers' },
      { type: 'quotes', note: 'parents and students' },
      { type: 'faq', note: 'admissions, fees, timings, transport' },
      CLOSE,
    ],
    pages: 'Programmes page: cards. Admissions page: steps + faq + contact. About page: split + stats + team.',
  },
  {
    id: 'fitness', label: 'Gym & fitness',
    match: /\b(gyms?|fitness|yoga|pilates|crossfit|martial|boxing|personal train|sports club|dance studio)/i,
    heroAction: 'Book a free trial: class, day → Book my trial',
    heroes: ['centered', 'action', 'split'],
    sections: [
      { type: 'features', note: 'classes or programmes' },
      { type: 'split', note: 'the coaches and the space' },
      { type: 'pricing', note: 'memberships, middle plan featured', variants: ['cards'] },
      { type: 'gallery', note: '5 training photos' },
      { type: 'quotes', note: 'members' },
      CLOSE,
    ],
    pages: 'Classes page: cards + timeline (the weekly timetable). Memberships page: pricing + faq. Contact page: contact.',
  },
  {
    id: 'retail', label: 'Shop & e-commerce',
    match: /\b(shop|online store|stores?|e-?commerce|retail|boutique|gear|apparel|fashion|clothing|equipment|furniture|electronics)\b/i,
    heroAction: 'Shop by category: category, size or budget → Shop now',
    heroes: ['mosaic', 'product', 'split', 'centered'],
    sections: [
      { type: 'cards', note: 'shop by category: photo and category name with a "Shop" button (no price)', variants: ['overlay'] },
      { type: 'cards', note: 'bestsellers with photo, badge, price and "Add to cart", "link" = View all', variants: ['grid', 'list'] },
      { type: 'split', note: 'the brand story and what makes the products different' },
      { type: 'stats', note: 'customers, products, rating, delivery time' },
      { type: 'quotes', note: 'customer reviews' },
      { type: 'faq', note: 'delivery, returns, sizing, warranty' },
      CLOSE,
    ],
    pages: 'Catalog page: cards. Product pages: split + features + quotes. Checkout or contact page: contact.',
  },
  {
    id: 'saas', label: 'Software & apps',
    match: /\b(saas|software|apps?|platform|ai|startup|api|dashboard|automation|analytics|tool for)\b/i,
    heroAction: 'Start free: work email → Get started',
    heroes: ['split', 'statement', 'centered'],
    sections: [
      { type: 'features', note: 'the 3–6 things it does, each with an icon' },
      { type: 'steps', note: 'how it works in 3 steps' },
      { type: 'split', note: 'the product in use with outcomes as points' },
      { type: 'stats', note: 'users, time saved, uptime, rating' },
      { type: 'quotes', note: 'customers with company names' },
      { type: 'pricing', note: '3 plans, middle featured', variants: ['cards'] },
      { type: 'faq', note: 'trial, data, cancellation, support' },
      CLOSE,
    ],
    pages: 'Features page: split per feature + comparison. Pricing page: pricing + faq. Contact page: contact.',
  },
]

export const DEFAULT_PLAYBOOK: Playbook = {
  id: 'general', label: 'General business',
  match: /$^/,
  heroAction: '',
  heroes: ['split', 'centered', 'action', 'mosaic'],
  sections: [
    { type: 'trust', note: '3–4 reasons to choose this business' },
    { type: 'features', note: 'what you offer, each with an icon' },
    { type: 'split', note: 'the story and the people' },
    { type: 'steps', note: 'how working with you goes' },
    { type: 'stats', note: 'the numbers that prove it' },
    { type: 'quotes', note: 'customers' },
    { type: 'faq', note: 'the questions customers really ask' },
    CLOSE,
  ],
  pages: 'Listings: cards. About page: split + stats + team. Contact page: contact.',
}

/** The art director's industry id first, then keywords: specific text (descriptor
 *  + request) before the long REFERENCE. */
export function pickPlaybook(primary: string, fallback = '', askedId = ''): Playbook {
  const id = askedId.toLowerCase().match(/[a-z]+/)?.[0] ?? ''
  if (id === 'general') return DEFAULT_PLAYBOOK
  return PLAYBOOKS.find((p) => p.id === id)
    ?? PLAYBOOKS.find((p) => p.match.test(primary))
    ?? PLAYBOOKS.find((p) => p.match.test(fallback))
    ?? DEFAULT_PLAYBOOK
}

/**
 * A WhatsApp number only when the request (or the brand's own site) mentions
 * WhatsApp AND gives an international number — never a guessed one.
 */
export function findWhatsApp(text: string): string {
  if (!/whats\s?app/i.test(text)) return ''
  const m = /(?:\+|\b00)\s?(\d[\d\s().-]{8,18}\d)/.exec(text)
  const digits = m ? m[1].replace(/\D/g, '') : ''
  return digits.length >= 10 && digits.length <= 15 ? digits : ''
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

export const BLOCKS_CSS = `${SECTIONS_CSS}
/* Rotating word with a caret */
.kit-rotate { display: inline-block; color: var(--primary-ink); font-weight: 600; transition: opacity .3s ease, transform .3s ease; }
:is(.hero-photo, .page-hero, .kit-dark, .kit-cta) .kit-rotate { color: var(--accent-on-dark) !important; }
.kit-rotate::after { content: ''; display: inline-block; width: 2px; height: 1em; margin-left: 4px; vertical-align: -.12em; background: currentColor; animation: kit-caret 1s steps(1) infinite; }
.kit-rotate.kit-out { opacity: 0; transform: translateY(6px); }
@keyframes kit-caret { 50% { opacity: 0; } }

/* WhatsApp */
.kit-wa { position: fixed; right: clamp(16px, 3vw, 28px); bottom: clamp(16px, 3vw, 28px); z-index: 120; width: 58px; height: 58px; border-radius: 50%; display: grid; place-items: center; background: #25d366; color: #fff !important; box-shadow: 0 10px 28px -6px rgba(0,0,0,.35); transition: transform .2s ease; }
.kit-wa:hover { transform: scale(1.07); opacity: 1; }
.kit-wa svg { width: 30px; height: 30px; fill: currentColor; }

@media (prefers-reduced-motion: reduce) { .kit-rotate::after { animation: none; } .kit-card:hover, .kit-feature:hover { transform: none; } }`

// ─── Page extras: count-up, rotating word, countdown, forms, WhatsApp ───────

/** Counts stats up when they scroll into view, cycles .kit-rotate words, runs
 *  event countdowns and thanks visitors for forms the page does not handle.
 *  Edits existing text nodes (never replaces them), so React keeps its
 *  references; MutationObserver picks up pages React renders later. */
export const KIT_MOTION_JS = `(function(){
  if (window.__kitMotion) return; window.__kitMotion = 1;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Times, ranges and years read wrong mid-count ("1:00 AM"), so they stay still
  var STILL = /\\d\\s*:\\s*\\d|\\d\\s*(am|pm)\\b|\\d\\s*[\\u2013\\u2014-]\\s*\\d|\\b(19|20)\\d\\d\\b/i;
  function parse(t){ if (STILL.test(t)) return null; var m = /^(\\D*?)(\\d[\\d,]*(?:\\.\\d+)?)(.*)$/.exec(t.trim()); if (!m) return null;
    return { pre: m[1], num: parseFloat(m[2].replace(/,/g, '')), dec: (m[2].split('.')[1] || '').length, comma: m[2].indexOf(',') > -1, post: m[3] }; }
  function fmt(p, v){ var s = v.toFixed(p.dec); if (p.comma) s = Number(s).toLocaleString('en-US', { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec }); return p.pre + s + p.post; }
  // The real number, read before anything animates: a page's own counter script
  // may read the "0" we start from as its target and leave the stat on zero
  function land(el){ var v = el.__kitFinal; if (v == null || el.textContent === v) return;
    // Only an interrupted count (stuck below the real number) is repaired — a React page may have updated it since
    var now = parse(el.textContent), fin = parse(v); if (now && fin && now.num > fin.num) return; var n = el.firstChild;
    if (n && n.nodeType === 3 && el.childNodes.length === 1) { if (n.nodeValue !== v) n.nodeValue = v; } else if (el.textContent !== v) el.textContent = v; }
  function count(el){ var n = el.firstChild; if (!n || n.nodeType !== 3 || el.childNodes.length !== 1) return;
    var p = parse(el.__kitFinal); if (!p || !(p.num > 0) || reduce) return;
    var t0 = 0, dur = 1400, done = false; n.nodeValue = fmt(p, 0);
    function step(ts){ if (done) return; if (!t0) t0 = ts; var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      if (n.parentNode === el) n.nodeValue = fmt(p, p.num * e); if (k < 1) requestAnimationFrame(step); else { done = true; land(el); } }
    requestAnimationFrame(step);
    // Animation frames pause in background tabs, and other counters may fight — the real number always lands
    [dur + 400, 4000, 8000].forEach(function(t){ setTimeout(function(){ done = true; land(el); }, t); }); }
  function rotate(el){ var words = (el.getAttribute('data-words') || '').split('|').map(function(w){ return w.trim(); }).filter(Boolean);
    var n = el.firstChild; if (words.length < 2 || !n || n.nodeType !== 3 || reduce) return; var i = 0;
    setInterval(function(){ el.classList.add('kit-out'); setTimeout(function(){ i = (i + 1) % words.length; n.nodeValue = words[i]; el.classList.remove('kit-out'); }, 300); }, 2600); }
  function countdown(el){ var end = new Date(el.getAttribute('data-kit-countdown')).getTime(); if (!(end > 0)) { el.hidden = true; return; }
    var units = {}; el.querySelectorAll('[data-unit]').forEach(function(u){ units[u.getAttribute('data-unit')] = u; });
    function set(k, v){ var u = units[k]; if (!u) return; var s = String(v).padStart(2, '0'); if (u.firstChild && u.firstChild.nodeType === 3) u.firstChild.nodeValue = s; else u.textContent = s; }
    function tick(){ var left = end - Date.now(); if (left <= 0) { el.hidden = true; return false; }
      var s = Math.floor(left / 1000); set('d', Math.floor(s / 86400)); set('h', Math.floor(s % 86400 / 3600)); set('m', Math.floor(s % 3600 / 60)); set('s', s % 60); return true; }
    if (tick()) { var t = setInterval(function(){ if (!tick() || !el.isConnected) clearInterval(t); }, 1000); } }
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function(es){ es.forEach(function(e){ if (e.isIntersecting) { io.unobserve(e.target); count(e.target); } }); }, { threshold: 0.4 }) : null;
  function scan(){
    document.querySelectorAll('.kit-stat-value, .hero-stat-value, .hero-glass-value').forEach(function(el){ if (el.__kit) return; el.__kit = 1; el.__kitFinal = el.textContent; if (io) io.observe(el); });
    document.querySelectorAll('.kit-rotate[data-words]').forEach(function(el){ if (el.__kit) return; el.__kit = 1; rotate(el); });
    document.querySelectorAll('[data-kit-countdown]').forEach(function(el){ if (el.__kit) return; el.__kit = 1; countdown(el); });
  }
  // A ForgeAI form the page's own script did not take over gets a thank-you
  document.addEventListener('submit', function(e){ var f = e.target; if (!f || !f.hasAttribute || !f.hasAttribute('data-kit-form') || e.defaultPrevented) return;
    e.preventDefault(); var p = document.createElement('p'); p.className = 'kit-thanks'; p.setAttribute('role', 'status');
    p.textContent = 'Thank you \\u2014 we have received your message and will be in touch soon.'; f.replaceWith(p); });
  function start(){ scan(); new MutationObserver(scan).observe(document.body, { childList: true, subtree: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();`

const WA_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>'

/** Adds the motion script and (when the business gave a WhatsApp number) the
 *  floating WhatsApp button to a page. Idempotent. */
export function applyKitExtras(html: string, kit: BrandKit): string {
  let out = html
  if (!/data-kit-motion/.test(out)) out = out.replace(/<\/body>/i, `<script data-kit-motion>${KIT_MOTION_JS}</script>\n</body>`)
  if (kit.whatsapp && !/class="kit-wa"/.test(out)) {
    out = out.replace(/<\/body>/i, `<a class="kit-wa" href="https://wa.me/${kit.whatsapp}" target="_blank" rel="noopener" aria-label="Chat with ${kit.name.replace(/["<>&]/g, '')} on WhatsApp">${WA_ICON}</a>\n</body>`)
  }
  return out
}
