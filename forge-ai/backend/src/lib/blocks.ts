// ─── ForgeAI Block Library ──────────────────────────────────────────────────
// Every section after the hero is built from these hand-styled blocks: the AI
// picks blocks and writes the words, ForgeAI owns the layout. An industry
// playbook decides which blocks a landing page uses and in what order, so a
// salon reads like a salon and a recruiter like a recruiter. The CSS ships in
// the brand layer (appended last), and AI-written rules for `kit-` classes are
// stripped, so a block can never be laid out wrong.

import type { BrandKit } from './brandKit'

export interface Playbook {
  id: string
  label: string
  match: RegExp
  /** Used when the art director gave no HERO ACTION */
  heroAction: string
  /** Landing page sections after the hero, in order */
  sections: string[]
  pages: string
}

const CLOSE = 'kit-cta — closing band with the two main actions'

// Order matters: specific trades before broad words like "shop" or "app", and
// professional services before property ("property disputes" is a law firm).
export const PLAYBOOKS: Playbook[] = [
  {
    id: 'recruitment', label: 'Recruitment & staffing',
    match: /recruit|staffing|temp work|job board|hiring agency|employment agency|warehouse jobs|placements?/i,
    heroAction: 'Find a job: role or keyword, location → Search jobs',
    sections: [
      'kit-trust — 4 reasons candidates and employers trust you (pay, compliance, speed, local)',
      'kit-steps — how it works: register → get matched → start work → get paid',
      'kit-cards (in a kit-head-row with "View all jobs") — 3–6 live roles: badge (shift type), meta (location · hours), title, one line, pay as kit-price, "Apply"',
      'kit-duo — candidates panel (photo) and employers panel (kit-duo-brand)',
      'kit-stats — placements, employer partners, locations, average start time',
      'kit-quotes — workers and employers',
      'kit-faq — pay, contracts, licences, how fast you start',
      CLOSE,
    ],
    pages: 'Jobs page: kit-cards for every role with filters above. Employers page: kit-features + kit-steps + kit-contact. Contact: kit-contact.',
  },
  {
    id: 'beauty', label: 'Salon, spa & beauty',
    match: /salon|barber|\bspa\b|beauty|\bnails?\b|lash|brow|skin ?care|aesthetic|makeup|\bhair/i,
    heroAction: 'Book an appointment: service, date → Check availability',
    sections: [
      'kit-cards — signature services with photo, duration as meta, price as kit-price, "Book"',
      'kit-split — the space and the team',
      'kit-gallery — 5 photos of work and the salon',
      'kit-quotes — clients',
      'kit-faq — booking, cancellations, aftercare',
      CLOSE,
    ],
    pages: 'Services page: kit-cards grouped by category. About: kit-split + kit-stats + kit-quotes. Contact: kit-contact with opening hours.',
  },
  {
    id: 'health', label: 'Clinic & healthcare',
    match: /clinic|dental|dentist|medical|doctor|physio|therapy|therapist|health ?care|pharmacy|optician|\bvet\b|veterinar|hospital/i,
    heroAction: 'Book an appointment: treatment, preferred date → Request appointment',
    sections: [
      'kit-trust — accreditations, insurance accepted, years of care, patient rating',
      'kit-features — treatments, each with an icon',
      'kit-steps — your first visit, step by step',
      'kit-split — the clinicians and the practice',
      'kit-quotes — patients',
      'kit-faq — costs, insurance, first appointment, emergencies',
      CLOSE,
    ],
    pages: 'Treatments: kit-cards. Team: kit-split per clinician. Contact: kit-contact with hours and directions.',
  },
  {
    id: 'trades', label: 'Trades & home services',
    match: /plumb|electrician|electrical|roof|landscap|garden|cleaning|cleaner|handyman|\bbuilders\b|home builder|building contractor|construction|renovat|hvac|pest control|locksmith|decorat|carpent|auto repair|mechanic|garage|removal/i,
    heroAction: 'Get a free quote: service, postcode → Get my quote',
    sections: [
      'kit-trust — insured, years trading, rating, workmanship guarantee',
      'kit-features — services, each with an icon',
      'kit-steps — quote → schedule → job done → aftercare',
      'kit-gallery — recent jobs',
      'kit-quotes — local customers',
      'kit-faq — pricing, call-outs, guarantees, areas covered',
      CLOSE,
    ],
    pages: 'Services: kit-features + kit-split per service. Areas: kit-cards of towns covered. Contact: kit-contact.',
  },
  {
    id: 'food', label: 'Restaurant, café & bakery',
    match: /restaurant|\bcaf[eé]|coffee|baker|bistro|takeaway|pizza|grill|kitchen|food|patisserie|catering|brunch|\bbar\b|brewer/i,
    heroAction: 'Book a table: date, time, guests → Find a table',
    sections: [
      'kit-cards — signature dishes or bakes with photo, short description and price',
      'kit-split — the story: the people, the craft, the ingredients',
      'kit-gallery — 5 photos: food, room, people',
      'kit-quotes — guests',
      'kit-contact — opening hours, address, phone, with the booking or order form',
      CLOSE,
    ],
    pages: 'Menu: kit-cards per course or category. About: kit-split + kit-gallery. Contact/visit: kit-contact.',
  },
  {
    id: 'hospitality', label: 'Hotel, travel & venues',
    match: /hotel|resort|guest ?house|\bb&b\b|hostel|lodge|villa|travel|tours?\b|holiday|safari|venue|wedding/i,
    heroAction: 'Check availability: check-in, check-out, guests → Check availability',
    sections: [
      'kit-cards — rooms or packages with photo, guests/size as meta, price per night',
      'kit-features — amenities',
      'kit-gallery — 6 photos',
      'kit-quotes — guests',
      'kit-contact — location, how to get there, enquiry form',
      CLOSE,
    ],
    pages: 'Rooms: kit-cards. Experiences: kit-split per experience. Contact: kit-contact.',
  },
  {
    id: 'professional', label: 'Professional services',
    match: /\blaw\b|legal|solicitor|attorney|lawyer|accountan|accounting|bookkeep|\btax\b|audit|consult|advisory|financial|insurance|marketing agency|digital agency/i,
    heroAction: 'Book a consultation: service, name, email → Request a call',
    sections: [
      'kit-features — services or practice areas',
      'kit-split — why clients choose you: the team and the approach',
      'kit-stats — clients, years, cases or savings, rating',
      'kit-quotes — clients',
      'kit-faq — fees, process, first meeting',
      CLOSE,
    ],
    pages: 'Services: kit-split per service. Team: kit-cards of people. Contact: kit-contact.',
  },
  {
    id: 'property', label: 'Real estate',
    match: /real estate|estate agen|realt|property|properties|letting|rentals?\b|(homes?|houses?|flats?|plots?) for (sale|rent)|selling (homes|houses)|apartments?/i,
    heroAction: 'Find a property: location, type, budget → Search',
    sections: [
      'kit-cards (in a kit-head-row with "View all properties") — featured listings: photo, badge (For sale / To let), beds · baths as meta, price',
      'kit-steps — how buying or renting works with you',
      'kit-stats — homes sold, average days to sell, areas, rating',
      'kit-duo — buyers panel (photo) and sellers/landlords panel (kit-duo-brand)',
      'kit-quotes — clients',
      CLOSE,
    ],
    pages: 'Listings: kit-cards with filters. Valuation: kit-steps + kit-contact. Contact: kit-contact.',
  },
  {
    id: 'education', label: 'School & education',
    match: /school|academy|nursery|kindergarten|tutor|tuition|college|university|courses?\b|training (centre|center|institute)|education|learning/i,
    heroAction: 'Book a visit: programme, name, phone → Book my visit',
    sections: [
      'kit-features — programmes or subjects',
      'kit-stats — students, results, teachers, years',
      'kit-split — the campus and the teachers',
      'kit-quotes — parents and students',
      'kit-faq — admissions, fees, timings, transport',
      CLOSE,
    ],
    pages: 'Programmes: kit-cards. Admissions: kit-steps + kit-faq + kit-contact. About: kit-split + kit-stats.',
  },
  {
    id: 'fitness', label: 'Gym & fitness',
    match: /\bgym|fitness|yoga|pilates|crossfit|martial|boxing|personal train|sports club|dance studio/i,
    heroAction: 'Book a free trial: class, day → Book my trial',
    sections: [
      'kit-features — classes or programmes',
      'kit-split — the coaches and the space',
      'kit-pricing — memberships (middle plan featured)',
      'kit-gallery — 5 training photos',
      'kit-quotes — members',
      CLOSE,
    ],
    pages: 'Timetable/classes: kit-cards. Memberships: kit-pricing + kit-faq. Contact: kit-contact.',
  },
  {
    id: 'retail', label: 'Shop & e-commerce',
    match: /\bshop|\bstore|e-?commerce|retail|boutique|\bgear\b|apparel|fashion|clothing|equipment|furniture|electronics/i,
    heroAction: 'Shop by category: category, size or budget → Shop now',
    sections: [
      'kit-cards — shop by category: photo and category name with a "Shop" action (no price)',
      'kit-cards (in a kit-head-row with "View all") — bestsellers with photo, badge, price and "Add to cart"',
      'kit-split — the brand story and what makes the products different',
      'kit-stats — customers, products, rating, delivery time',
      'kit-quotes — customer reviews with stars',
      'kit-faq — delivery, returns, sizing, warranty',
      CLOSE,
    ],
    pages: 'Catalog: kit-cards with filters above. Product/builder pages: kit-split + kit-features. Checkout: kit-form inside kit-contact layout.',
  },
  {
    id: 'saas', label: 'Software & apps',
    match: /saas|software|\bapp\b|platform|\bai\b|startup|api|dashboard|automation|analytics|tool for/i,
    heroAction: 'Start free: work email → Get started',
    sections: [
      'kit-features — the 3–6 things it does, each with an icon',
      'kit-steps — how it works in 3 steps',
      'kit-split — the product in use (screenshot-style photo) with outcomes as kit-checks',
      'kit-stats — users, time saved, uptime, rating',
      'kit-quotes — customers with company names',
      'kit-pricing — 3 plans, middle featured',
      'kit-faq — trial, data, cancellation, support',
      CLOSE,
    ],
    pages: 'Features: kit-split per feature. Pricing: kit-pricing + kit-faq. Contact: kit-contact.',
  },
]

export const DEFAULT_PLAYBOOK: Playbook = {
  id: 'general', label: 'General business',
  match: /$^/,
  heroAction: '',
  sections: [
    'kit-trust — 3–4 reasons to choose this business',
    'kit-features — what you offer, each with an icon',
    'kit-split — the story and the people',
    'kit-steps — how working with you goes',
    'kit-stats — the numbers that prove it',
    'kit-quotes — customers',
    'kit-faq — the questions customers really ask',
    CLOSE,
  ],
  pages: 'Listings: kit-cards. About: kit-split + kit-stats + kit-quotes. Contact: kit-contact.',
}

/** Specific text first (descriptor + request), the art director's long REFERENCE last. */
export function pickPlaybook(primary: string, fallback = ''): Playbook {
  return PLAYBOOKS.find((p) => p.match.test(primary)) ?? PLAYBOOKS.find((p) => p.match.test(fallback)) ?? DEFAULT_PLAYBOOK
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

// ─── Prompt text ─────────────────────────────────────────────────────────────

const LIBRARY = `BLOCK LIBRARY — ForgeAI's stylesheet fully styles every class below (layout, spacing, colours, hover, phone layout). Build EVERY section after the hero from these blocks. Write NO CSS for any class starting with "kit-" and no inline styles. Replace «…» with real content; repeat items as noted.
SECTION SHELL: <section class="kit-section"> (add "kit-alt" for a tinted band or "kit-dark" for a dark band; alternate them) <div class="container"> <div class="kit-head"><span class="eyebrow">«label»</span><h2>«title»</h2><p>«one line»</p></div> «block» </div></section>
  Heading with an action on the right: <div class="kit-head-row"><div class="kit-head">…</div><a class="btn btn-secondary" href="…">«View all»</a></div>
ICON: <span class="kit-icon">«inline SVG line icon, viewBox="0 0 24 24", stroke="currentColor", fill="none"»</span>
kit-trust (slim band of reasons to trust, directly after the hero): <section class="kit-trust"><div class="container"><ul class="kit-trust-list"> 3–4× <li><span class="kit-icon">…</span><div><strong>«label»</strong><span>«detail»</span></div></li> </ul></div></section>
kit-logos (ONLY when the request or the brand's real site names actual clients — never invent company names): <section class="kit-logos"><div class="container"><p class="kit-logos-title">«Trusted by …»</p><ul class="kit-logos-list"> 4–6× <li>«Company»</li> </ul></div></section>
kit-features: <div class="kit-features"> 3–6× <article class="kit-feature"><span class="kit-icon">…</span><h3>«title»</h3><p>«two lines»</p></article> </div>
kit-steps: <ol class="kit-steps"> 3–4× <li class="kit-step"><span class="kit-step-num">01</span><h3>«step»</h3><p>«detail»</p></li> </ol>
kit-split (photo + story; alternate with class="kit-split kit-split-reverse"): <div class="kit-split"><figure class="kit-split-media"><img src="«library photo»" alt="«…»"></figure><div class="kit-split-body"><span class="eyebrow">…</span><h2>…</h2><p>…</p><ul class="kit-checks"> 3–4× <li>«point — plain text, no icon»</li> </ul><div class="kit-actions"><a class="btn btn-primary" href="…">…</a></div></div></div>
kit-cards (listings: jobs, products, rooms, menu items, services, people): <div class="kit-cards"> 3–6× <article class="kit-card"><div class="kit-card-media"><img src="…" alt="…"><span class="kit-badge">«optional tag»</span></div><div class="kit-card-body"><p class="kit-card-meta"><span>«meta»</span><span>«meta»</span></p><h3>«name»</h3><p>«one line»</p><div class="kit-card-foot"><span class="kit-price">«price, or omit»</span><a class="btn btn-secondary" href="…">«action»</a></div></div></article> </div>  (no photo: drop kit-card-media and put the kit-badge first inside kit-card-body)
kit-stats (dark band of numbers that count up on scroll): <section class="kit-stats"><div class="container"><div class="kit-stats-grid"> 3–4× <div class="kit-stat"><span class="kit-stat-value">«500+»</span><span class="kit-stat-label">«label»</span></div> </div></div></section>
kit-gallery: <div class="kit-gallery"> 3–7× <figure><img src="…" alt="…"><figcaption>«caption»</figcaption></figure> </div>  (first photo shows large; any count lays out cleanly)
kit-quotes: <div class="kit-quotes"> 3× <figure class="kit-quote"><div class="kit-stars">★★★★★</div><blockquote>«quote»</blockquote><figcaption><span class="kit-avatar">«initials»</span><span><strong>«name»</strong><small>«role, place»</small></span></figcaption></figure> </div>
kit-faq (native accordion, no JavaScript): <div class="kit-faq"> 5–7× <details><summary>«question»</summary><p>«answer»</p></details> </div>
kit-duo (two audiences side by side): <div class="kit-duo"><div class="kit-duo-panel"><img class="hero-bg" src="«library photo»" alt=""><span class="eyebrow">«For candidates»</span><h3>…</h3><p>…</p><a class="btn btn-primary" href="…">…</a></div><div class="kit-duo-panel kit-duo-brand"><span class="eyebrow">«For employers»</span><h3>…</h3><p>…</p><a class="btn btn-secondary" href="…">…</a></div></div>
kit-pricing: <div class="kit-pricing"> 3× <article class="kit-plan"> (middle: class="kit-plan kit-plan-featured" plus <span class="kit-badge">Most popular</span>) <h3>«plan»</h3><p class="kit-plan-price">«£29»<small>«/month»</small></p><p>«who it's for»</p><ul class="kit-checks">…</ul><a class="btn btn-primary" href="…">…</a></article> </div>
kit-contact: <div class="kit-contact"><div><span class="eyebrow">…</span><h2>…</h2><p>…</p><ul class="kit-contact-list"> 3–4× <li><span class="kit-icon">…</span><div><strong>«Phone»</strong><a href="tel:…">«…»</a></div></li> </ul></div><form class="kit-form"><div class="kit-form-row">«two labelled fields»</div>«more labelled fields»<button type="submit" class="btn btn-primary">«Send»</button></form></div>
kit-cta (closing band — EVERY page ends with it): <section class="kit-cta"><div class="container kit-cta-inner"><div><h2>«…»</h2><p>«…»</p></div><div class="kit-actions"><a class="btn btn-primary" href="…">…</a><a class="btn btn-secondary" href="…">…</a></div></div></section>
ROTATING WORD (optional, once, inside the hero lead): <span class="kit-rotate" data-words="«Forklift drivers|Pickers|Packers»">«Forklift drivers»</span>`

/** The landing-page recipe for this business plus the block library. */
export function blocksBrief(kit: BrandKit, flavour: 'jsx' | 'html'): string {
  const p = kit.playbook
  const jsx = flavour === 'jsx'
    ? '\n(JSX: write className instead of class, self-close <img … />, and use <Link to="…"> for links to other pages of the site.)'
    : ''
  return `LANDING PAGE RECIPE — ${p.label}. After the LANDING HERO, build these sections in this order, each from the BLOCK LIBRARY:
${p.sections.map((s, i) => `${i + 1}. ${s}`).join('\n')}
OTHER PAGES: start with the page-hero, then use blocks — ${p.pages} Every page ends with kit-cta.

${LIBRARY}${jsx}`
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

export const BLOCKS_CSS = `/* ── Block library ── */
.kit-section { padding-block: clamp(64px, 9vw, 112px); background: var(--bg); color: var(--text); position: relative; }
.kit-section.kit-alt { background: var(--surface); }
.kit-section.kit-dark { background: var(--ink); color: #fff; }
/* Dark bands re-scope the colour tokens, so every block inside reads light-on-dark */
.kit-section.kit-dark, .kit-stats, .kit-cta { --text: #ffffff; --muted: rgba(255,255,255,.72); --border: rgba(255,255,255,.12); --border-strong: rgba(255,255,255,.22); --bg: rgba(255,255,255,.04); --surface: rgba(255,255,255,.05); --surface-2: rgba(255,255,255,.08); --primary-ink: var(--accent-on-dark); }
.kit-dark :is(h2, h3, h4, strong, blockquote) { color: #fff; }
.kit-dark :is(p, li, small) { color: rgba(255,255,255,.76); }
.kit-dark .eyebrow { color: var(--accent-on-dark); }
/* Blocks never depend on the page's own .container rule for width and gutters */
:is(.kit-section, .kit-trust, .kit-logos, .kit-stats, .kit-cta) > .container { width: 100%; max-width: var(--maxw, 1200px); margin-inline: auto; padding-inline: clamp(20px, 5vw, 40px); }
.kit-head { max-width: 720px; margin: 0 auto clamp(2.25rem, 4.5vw, 3.5rem); text-align: center; }
.kit-head > * { margin-inline: auto; }
.kit-head h2 { margin-top: .35rem; margin-bottom: .85rem; }
.kit-head p { color: var(--muted); font-size: clamp(1.02rem, 1.3vw, 1.15rem); line-height: 1.65; margin-bottom: 0; max-width: 60ch; }
.kit-dark .kit-head p { color: rgba(255,255,255,.72); }
.kit-head-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem 2rem; flex-wrap: wrap; margin-bottom: clamp(2rem, 4vw, 3rem); }
.kit-head-row .kit-head { margin: 0; text-align: left; }
.kit-head-row .kit-head > * { margin-inline: 0; }
.kit-icon { display: inline-grid; place-items: center; width: 48px; height: 48px; flex-shrink: 0; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--primary) 12%, transparent); color: var(--primary-ink); }
.kit-icon svg { width: 24px; height: 24px; }
.kit-dark .kit-icon { background: rgba(255,255,255,.08); color: var(--accent-on-dark); }
.kit-actions { display: flex; flex-wrap: wrap; gap: .8rem; align-items: center; }
/* Button baseline at zero specificity — only fills gaps the page's own CSS left */
:where(.btn) { display: inline-flex; align-items: center; justify-content: center; gap: .5rem; padding: .85rem 1.5rem; font-weight: 700; line-height: 1.1; border: 1.5px solid transparent; cursor: pointer; text-decoration: none; }
:where(.btn-secondary) { background: transparent; color: var(--text); border-color: var(--border-strong); }

/* Trust band */
.kit-trust { padding-block: clamp(28px, 4vw, 40px); background: var(--surface); border-bottom: 1px solid var(--border); }
.kit-trust-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem 2rem; }
.kit-trust-list > li { display: flex; align-items: flex-start; gap: .9rem; }
.kit-trust-list strong { display: block; font-weight: 700; color: var(--text); line-height: 1.3; }
.kit-trust-list li span:not(.kit-icon) { display: block; color: var(--muted); font-size: .92rem; line-height: 1.5; margin-top: .15rem; }

/* Client names */
.kit-logos { padding-block: clamp(32px, 5vw, 48px); border-block: 1px solid var(--border); }
.kit-logos-title { text-align: center; font-size: .78rem; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); margin: 0 0 1.25rem; }
.kit-logos-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: .9rem clamp(1.75rem, 4vw, 3.25rem); }
.kit-logos-list > li { font-family: var(--font-heading); font-weight: var(--heading-weight); text-transform: uppercase; letter-spacing: .06em; font-size: clamp(1rem, 1.5vw, 1.2rem); color: var(--text); opacity: .55; white-space: nowrap; }

/* Features */
.kit-features { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); gap: clamp(1rem, 2vw, 1.5rem); }
.kit-feature { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: clamp(1.4rem, 2.5vw, 1.9rem); transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease; }
.kit-feature:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); border-color: color-mix(in srgb, var(--primary) 35%, var(--border)); }
.kit-feature h3 { font-size: 1.2rem; margin: 1rem 0 .5rem; }
.kit-feature p { color: var(--muted); margin: 0; line-height: 1.6; }
.kit-dark .kit-feature { background: rgba(255,255,255,.04); border-color: rgba(255,255,255,.1); }

/* Steps */
.kit-steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr)); gap: clamp(1.5rem, 3vw, 2rem); }
.kit-step { position: relative; }
.kit-step-num { display: inline-grid; place-items: center; width: 52px; height: 52px; border-radius: 50%; background: var(--primary); color: var(--on-primary); font-family: var(--font-heading); font-weight: 800; font-size: 1.15rem; position: relative; z-index: 1; box-shadow: 0 0 0 6px var(--bg); }
.kit-alt .kit-step-num { box-shadow: 0 0 0 6px var(--surface); }
.kit-dark .kit-step-num { box-shadow: 0 0 0 6px var(--ink); }
.kit-step h3 { font-size: 1.15rem; margin: 1.1rem 0 .45rem; }
.kit-step p { color: var(--muted); margin: 0; line-height: 1.6; }
@media (min-width: 900px) { .kit-step:not(:last-child)::after { content: ''; position: absolute; top: 25px; left: 66px; right: -1rem; height: 2px; background: var(--border-strong); } }

/* Split */
.kit-split { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(2rem, 5vw, 4.5rem); align-items: center; }
.kit-split + .kit-split { margin-top: clamp(3rem, 7vw, 5.5rem); }
.kit-split-reverse > .kit-split-media { order: 2; }
.kit-split-media { margin: 0; border-radius: var(--radius-lg); overflow: hidden; aspect-ratio: 4 / 3; box-shadow: var(--shadow-lg); background: var(--surface-2); }
.kit-split-media img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 0 !important; }
.kit-split-body h2 { margin: .35rem 0 1rem; }
.kit-split-body > p { color: var(--muted); font-size: 1.05rem; line-height: 1.7; }
.kit-checks { list-style: none; padding: 0; margin: 1.25rem 0 1.75rem; display: grid; gap: .7rem; }
.kit-checks > li { display: flex; gap: .7rem; align-items: flex-start; line-height: 1.5; }
.kit-checks > li::before { content: '✓'; flex-shrink: 0; display: inline-grid; place-items: center; width: 22px; height: 22px; margin-top: .05em; border-radius: 50%; background: color-mix(in srgb, var(--primary) 14%, transparent); color: var(--primary-ink); font-weight: 800; font-size: .75rem; }
.kit-dark .kit-checks > li::before { color: var(--accent-on-dark); }

/* Cards */
.kit-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: clamp(1rem, 2vw, 1.5rem); }
.kit-card { display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; transition: transform .2s ease, box-shadow .2s ease; }
.kit-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); }
.kit-card-media { position: relative; aspect-ratio: 16 / 10; overflow: hidden; margin: 0; background: var(--surface-2); }
.kit-card-media img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 0 !important; transition: transform .45s ease; }
.kit-card:hover .kit-card-media img { transform: scale(1.04); }
.kit-badge { display: inline-flex; align-items: center; padding: .3rem .7rem; border-radius: 999px; font-size: .7rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; background: var(--primary); color: var(--on-primary); line-height: 1.3; }
.kit-card-media .kit-badge { position: absolute; top: .85rem; left: .85rem; }
.kit-card-body > .kit-badge { align-self: flex-start; margin-bottom: .8rem; }
.kit-card-body { display: flex; flex-direction: column; flex: 1; padding: clamp(1.15rem, 2vw, 1.5rem); }
.kit-card-meta { display: flex; flex-wrap: wrap; gap: .25rem 1rem; font-size: .82rem; color: var(--muted); margin: 0 0 .45rem; }
.kit-card-body h3 { font-size: 1.15rem; margin: 0 0 .5rem; }
.kit-card-body > p:not(.kit-card-meta) { color: var(--muted); font-size: .95rem; line-height: 1.55; margin: 0 0 1.1rem; }
.kit-card-foot { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); }
.kit-price { font-family: var(--font-heading); font-weight: var(--heading-weight); font-size: 1.25rem; color: var(--text); }
.kit-card-foot :is(.btn, .btn-primary, .btn-secondary, button) { padding: .6rem 1rem; font-size: .88rem; }

/* Stats band */
.kit-stats { background: var(--ink); color: #fff; padding-block: clamp(48px, 7vw, 80px); }
.kit-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 2rem; text-align: center; }
.kit-stat-value { display: block; font-family: var(--font-heading); font-weight: var(--heading-weight); text-transform: var(--heading-case); font-size: clamp(2.4rem, 5vw, 3.6rem); line-height: 1; color: var(--accent-on-dark); font-variant-numeric: tabular-nums; }
.kit-stat-label { display: block; margin-top: .6rem; color: rgba(255,255,255,.72); font-size: .95rem; }

/* Gallery — first photo large; every count from 2 to 8 fills the grid */
.kit-gallery { display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: clamp(140px, 17vw, 230px); gap: clamp(.6rem, 1.2vw, 1rem); }
.kit-gallery > figure { margin: 0; position: relative; overflow: hidden; border-radius: var(--radius); background: var(--surface-2); }
.kit-gallery img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 0 !important; transition: transform .5s ease; }
.kit-gallery > figure:hover img { transform: scale(1.05); }
.kit-gallery figcaption { position: absolute; left: 0; right: 0; bottom: 0; padding: 2rem 1rem .85rem; background: linear-gradient(0deg, rgba(0,0,0,.66), transparent); color: #fff; font-size: .88rem; font-weight: 600; opacity: 0; transition: opacity .25s ease; }
.kit-gallery > figure:hover figcaption { opacity: 1; }
.kit-gallery > :first-child { grid-column: span 2; grid-row: span 2; }
.kit-gallery:has(> :nth-child(2):last-child) { grid-template-columns: 1fr 1fr; }
.kit-gallery:has(> :nth-child(2):last-child) > * { grid-column: auto; grid-row: span 2; }
.kit-gallery:has(> :nth-child(3):last-child) > :not(:first-child) { grid-column: span 2; }
.kit-gallery:has(> :nth-child(4):last-child) > :last-child { grid-column: span 2; }
.kit-gallery:has(> :nth-child(6):last-child) { grid-template-columns: repeat(3, 1fr); }
.kit-gallery:has(> :nth-child(6):last-child) > :first-child { grid-column: auto; grid-row: auto; }
.kit-gallery:has(> :nth-child(7):last-child) > :nth-child(n+6) { grid-column: span 2; }
.kit-gallery:has(> :nth-child(8):last-child) > :last-child { grid-column: span 2; }
@media (max-width: 640px) {
  .kit-gallery { grid-template-columns: 1fr 1fr !important; grid-auto-rows: 150px; }
  .kit-gallery > * { grid-column: auto !important; grid-row: auto !important; }
  .kit-gallery > :first-child, .kit-gallery > :last-child:nth-child(even) { grid-column: span 2 !important; }
}

/* Testimonials */
.kit-quotes { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 290px), 1fr)); gap: clamp(1rem, 2vw, 1.5rem); }
.kit-quote { margin: 0; display: flex; flex-direction: column; gap: 1rem; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: clamp(1.4rem, 2.5vw, 1.9rem); }
.kit-stars { color: var(--primary-ink); letter-spacing: .15em; font-size: .95rem; }
.kit-quote blockquote { margin: 0; font-size: 1.05rem; line-height: 1.65; color: var(--text); }
.kit-quote figcaption { margin-top: auto; display: flex; align-items: center; gap: .8rem; }
.kit-avatar { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: var(--ink); color: #fff; font-weight: 700; font-size: .9rem; flex-shrink: 0; }
.kit-quote figcaption strong { display: block; font-size: .95rem; color: var(--text); }
.kit-quote figcaption small { display: block; color: var(--muted); font-size: .82rem; }
.kit-dark .kit-quote { background: rgba(255,255,255,.05); border-color: rgba(255,255,255,.1); }
.kit-dark .kit-stars { color: var(--accent-on-dark); }
.kit-dark .kit-avatar { background: var(--primary); color: var(--on-primary); }

/* FAQ */
.kit-faq { max-width: 820px; margin: 0 auto; border-top: 1px solid var(--border); }
.kit-faq details { border-bottom: 1px solid var(--border); }
.kit-faq summary { list-style: none; cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 1.5rem; padding: 1.3rem 0; font-weight: 600; font-size: 1.08rem; color: var(--text); }
.kit-faq summary::-webkit-details-marker { display: none; }
.kit-faq summary::after { content: '+'; flex-shrink: 0; width: 32px; height: 32px; display: grid; place-items: center; border-radius: 50%; background: var(--surface-2); color: var(--text); font-size: 1.25rem; line-height: 1; transition: transform .25s ease, background .2s ease; }
.kit-faq details[open] summary::after { transform: rotate(45deg); background: var(--primary); color: var(--on-primary); }
.kit-faq details > :not(summary) { margin: 0 0 1.3rem; color: var(--muted); line-height: 1.7; max-width: 68ch; }

/* Closing band */
.kit-cta { position: relative; overflow: hidden; background: var(--ink); color: #fff; padding-block: clamp(56px, 8vw, 96px); }
.kit-cta::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 6px; background: var(--primary); z-index: 2; }
.kit-cta > .hero-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; max-width: none; border-radius: 0 !important; }
.kit-cta:has(> .hero-bg)::after { content: ''; position: absolute; inset: 0; z-index: 1; background: rgba(10,11,13,.78); }
.kit-cta > :not(.hero-bg) { position: relative; z-index: 2; }
.kit-cta-inner { display: flex; align-items: center; justify-content: space-between; gap: 1.5rem 2.5rem; flex-wrap: wrap; }
.kit-cta h2 { color: #fff !important; margin: 0 0 .6rem; max-width: 22ch; }
.kit-cta p { color: rgba(255,255,255,.78) !important; margin: 0; max-width: 56ch; }
.kit-cta :is(.btn-secondary, .btn-ghost) { background: transparent !important; color: #fff !important; border: 1.5px solid rgba(255,255,255,.42) !important; }

/* Two audiences */
.kit-duo { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(1rem, 2vw, 1.5rem); }
.kit-duo-panel { position: relative; overflow: hidden; isolation: isolate; border-radius: var(--radius-lg); padding: clamp(1.75rem, 4vw, 3rem); min-height: 340px; display: flex; flex-direction: column; justify-content: flex-end; align-items: flex-start; background: var(--ink); color: #fff; }
.kit-duo-panel > .hero-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -2; max-width: none; border-radius: 0 !important; }
.kit-duo-panel:has(> .hero-bg)::after { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(0deg, rgba(10,11,13,.9) 0%, rgba(10,11,13,.35) 100%); }
.kit-duo-panel h3 { color: #fff !important; font-size: clamp(1.5rem, 2.6vw, 2.1rem); margin: .35rem 0 .6rem; text-transform: var(--heading-case); }
.kit-duo-panel p { color: rgba(255,255,255,.82) !important; margin: 0 0 1.5rem; max-width: 46ch; }
.kit-duo-panel .eyebrow { color: var(--accent-on-dark) !important; }
.kit-duo-panel.kit-duo-brand { background: var(--primary); }
.kit-duo-brand :is(h3, p, .eyebrow) { color: var(--on-primary) !important; }
.kit-duo-brand :is(.btn, .btn-primary, .btn-secondary, a.btn) { background: var(--ink) !important; color: #fff !important; border-color: var(--ink) !important; }
@media (max-width: 760px) { .kit-duo { grid-template-columns: 1fr; } .kit-duo-panel { min-height: 280px; } }

/* Pricing */
.kit-pricing { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: clamp(1rem, 2vw, 1.5rem); align-items: stretch; }
.kit-plan { position: relative; display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: clamp(1.5rem, 3vw, 2.1rem); }
.kit-plan h3 { font-size: 1.1rem; margin: 0 0 .75rem; }
.kit-plan-price { font-family: var(--font-heading); font-weight: var(--heading-weight); font-size: clamp(2.2rem, 4vw, 2.9rem); line-height: 1; color: var(--text); margin: 0 0 .6rem; }
.kit-plan-price small { font-family: var(--font-body); font-size: .9rem; font-weight: 500; color: var(--muted); margin-left: .25rem; }
.kit-plan > p:not(.kit-plan-price) { color: var(--muted); margin: 0 0 1rem; }
.kit-plan .kit-checks { margin: .5rem 0 1.75rem; }
.kit-plan > :is(.btn, a.btn, button) { margin-top: auto; width: 100%; justify-content: center; }
.kit-plan-featured { border: 2px solid var(--primary); box-shadow: var(--shadow-lg); }
.kit-plan > .kit-badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); white-space: nowrap; }

/* Contact */
.kit-contact { display: grid; grid-template-columns: .9fr 1.1fr; gap: clamp(2rem, 5vw, 4rem); align-items: start; }
.kit-contact h2 { margin: .35rem 0 .9rem; }
.kit-contact-list { list-style: none; padding: 0; margin: 1.5rem 0 0; display: grid; gap: 1.1rem; }
.kit-contact-list > li { display: flex; gap: .9rem; align-items: flex-start; }
.kit-contact-list strong { display: block; font-size: .78rem; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 700; margin-bottom: .15rem; }
.kit-contact-list li :is(a, span:not(.kit-icon)) { color: var(--text); font-weight: 600; font-size: 1.05rem; text-decoration: none; }
.kit-form { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: clamp(1.4rem, 3vw, 2.2rem); box-shadow: var(--shadow); display: grid; gap: 1rem; }
.kit-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.kit-form label { display: block; font-size: .85rem; font-weight: 600; color: var(--text); margin: 0 0 .4rem; }
.kit-form :is(.btn, button[type="submit"]) { justify-self: start; }
@media (max-width: 860px) {
  .kit-split, .kit-contact { grid-template-columns: 1fr; }
  .kit-split-reverse > .kit-split-media { order: 0; }
  .kit-form-row { grid-template-columns: 1fr; }
  .kit-cta-inner { flex-direction: column; align-items: flex-start; }
}

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

// ─── Page extras: count-up, rotating word, WhatsApp ──────────────────────────

/** Counts stats up when they scroll into view and cycles .kit-rotate words.
 *  Edits the existing text node (never replaces it), so React keeps its
 *  reference; MutationObserver picks up pages React renders later. */
export const KIT_MOTION_JS = `(function(){
  if (window.__kitMotion) return; window.__kitMotion = 1;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Times, ranges and years read wrong mid-count ("1:00 AM"), so they stay still
  var STILL = /\\d\\s*:\\s*\\d|\\d\\s*(am|pm)\\b|\\d\\s*[\\u2013\\u2014-]\\s*\\d|\\b(19|20)\\d\\d\\b/i;
  function parse(t){ if (STILL.test(t)) return null; var m = /^(\\D*?)(\\d[\\d,]*(?:\\.\\d+)?)(.*)$/.exec(t.trim()); if (!m) return null;
    return { pre: m[1], num: parseFloat(m[2].replace(/,/g, '')), dec: (m[2].split('.')[1] || '').length, comma: m[2].indexOf(',') > -1, post: m[3] }; }
  function fmt(p, v){ var s = v.toFixed(p.dec); if (p.comma) s = Number(s).toLocaleString('en-US', { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec }); return p.pre + s + p.post; }
  function count(el){ var n = el.firstChild; if (!n || n.nodeType !== 3 || el.childNodes.length !== 1) return;
    var p = parse(n.nodeValue); if (!p || !(p.num > 0) || reduce) return;
    var t0 = 0, dur = 1400, done = false; n.nodeValue = fmt(p, 0);
    function step(ts){ if (done) return; if (!t0) t0 = ts; var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      n.nodeValue = fmt(p, p.num * e); if (k < 1) requestAnimationFrame(step); else done = true; }
    requestAnimationFrame(step);
    // Animation frames pause in background tabs — the real number always lands
    setTimeout(function(){ if (!done) { done = true; n.nodeValue = fmt(p, p.num); } }, dur + 400); }
  function rotate(el){ var words = (el.getAttribute('data-words') || '').split('|').map(function(w){ return w.trim(); }).filter(Boolean);
    var n = el.firstChild; if (words.length < 2 || !n || n.nodeType !== 3 || reduce) return; var i = 0;
    setInterval(function(){ el.classList.add('kit-out'); setTimeout(function(){ i = (i + 1) % words.length; n.nodeValue = words[i]; el.classList.remove('kit-out'); }, 300); }, 2600); }
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function(es){ es.forEach(function(e){ if (e.isIntersecting) { io.unobserve(e.target); count(e.target); } }); }, { threshold: 0.4 }) : null;
  function scan(){
    document.querySelectorAll('.kit-stat-value, .hero-stat-value, .hero-glass-value').forEach(function(el){ if (el.__kit) return; el.__kit = 1; if (io) io.observe(el); });
    document.querySelectorAll('.kit-rotate[data-words]').forEach(function(el){ if (el.__kit) return; el.__kit = 1; rotate(el); });
  }
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
