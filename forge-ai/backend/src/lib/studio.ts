// The home page's build conversation, with no AI: the questions it asks, the
// home page and colour options it offers, and the live preview of each. AI runs
// only when the client presses Build; everything up to then is ForgeAI's own code.

import { applyBrandToHtml, buildBrandKit, colorOptions, finalizeBrandCss, mirrorForRtl, type BrandKit, type ColorOption } from './brandKit'
import { getPackCss } from './designPacks'
import { pickPlaybook } from './blocks'
import { expandSections } from './sections/expand'
import { heroByLayout } from './sections/heroes'
import { seed } from './sections/plan'
import { SITE_TYPES } from './sections/siteTypes'

export interface Question {
  id: string
  text: string
  type: 'text' | 'single' | 'multi'
  options?: { value: string; label: string }[]
  placeholder?: string
}

const KIND_RULES: [string, RegExp][] = [
  ['quiz', /\b(quiz|trivia|assessment|personality test)\b/i],
  ['calendar', /\b(events? calendar|what'?s on|comedy club|arts? cent(?:re|er)|workshops?|classes? schedule|meet-?ups?|league)\b/i],
  ['events', /\b(conference|festival|wedding|concert|exhibition|summit|expo)\b/i],
  ['content', /\b(blog|magazine|recipes?|news site|articles?)\b/i],
  ['store', /\b(shop|store|e-?commerce|sell(?:s|ing)?|products?)\b/i],
  ['software', /\b(saas|software|app|platform|ai tool|dashboard)\b/i],
  ['portfolio', /\b(portfolio|photographer|architect|designer|my work)\b/i],
  ['directory', /\b(job board|directory|marketplace|listings?|property portal)\b/i],
  ['nonprofit', /\b(charity|ngo|non-?profit|mosque|masjid|church|foundation)\b/i],
  ['launch', /\b(waitlist|coming soon|pre-?order)\b/i],
  ['community', /\b(dating|forum|membership|community|social network)\b/i],
]

// A request that names a trade ("family bakery") already says what kind of site it is
const PLAYBOOK_KIND: Record<string, string> = { retail: 'store', saas: 'software', general: '' }
const guessKind = (prompt: string) => {
  const id = pickPlaybook(prompt).id
  return KIND_RULES.find(([, re]) => re.test(prompt))?.[0] ?? (id in PLAYBOOK_KIND ? PLAYBOOK_KIND[id] : 'business')
}

/** "called Lahore Table", "named AMI", "brand AMI" */
export function nameInPrompt(prompt: string): string {
  const m = /\b(?:called|named|brand(?:\s+name)?(?:\s+is)?|name(?:\s+is)?)\s+["“']?([\p{Lu}0-9][\p{L}0-9&'-]*(?:\s+[\p{Lu}0-9][\p{L}0-9&'-]*){0,3})/u.exec(prompt)
  return m?.[1]?.trim() ?? ''
}

const INCLUDE: Record<string, [string, string][]> = {
  business: [['booking', 'Online booking'], ['pricing', 'Prices'], ['gallery', 'Photo gallery'], ['reviews', 'Customer reviews'], ['team', 'Meet the team'], ['faq', 'FAQ'], ['contact', 'Contact form and map'], ['blog', 'Blog']],
  store: [['catalog', 'Product catalogue'], ['categories', 'Shop by category'], ['bestsellers', 'Best sellers'], ['reviews', 'Customer reviews'], ['delivery', 'Delivery and returns'], ['newsletter', 'Newsletter sign-up'], ['about', 'Brand story']],
  software: [['features', 'Feature tour'], ['pricing', 'Pricing plans'], ['compare', 'Comparison table'], ['reviews', 'Customer quotes'], ['faq', 'FAQ'], ['demo', 'Demo request form'], ['blog', 'Blog']],
  portfolio: [['work', 'Selected work'], ['about', 'About me'], ['process', 'How I work'], ['reviews', 'Client quotes'], ['pricing', 'Packages'], ['contact', 'Contact form']],
  content: [['articles', 'Articles'], ['topics', 'Browse by topic'], ['search', 'Search'], ['about', 'About the writer'], ['newsletter', 'Newsletter sign-up'], ['contact', 'Contact page']],
  quiz: [['capture', 'Collect visitors\' emails'], ['moreQuizzes', 'More quizzes'], ['about', 'About us'], ['faq', 'FAQ'], ['contact', 'Contact page']],
  calendar: [['calendar', 'Events calendar'], ['eventPages', 'A page for big events'], ['rsvp', 'Free RSVP'], ['tickets', 'Ticket prices'], ['gallery', 'Past events photos'], ['newsletter', 'Newsletter sign-up'], ['visit', 'How to find us']],
  events: [['schedule', 'Programme'], ['speakers', 'Speakers or performers'], ['tickets', 'Tickets'], ['rsvp', 'RSVP form'], ['venue', 'Venue and map'], ['faq', 'FAQ']],
  directory: [['listings', 'Listings with filters'], ['categories', 'Browse by category'], ['howItWorks', 'How it works'], ['pricing', 'Prices for listing'], ['reviews', 'User quotes'], ['contact', 'Contact page']],
  nonprofit: [['impact', 'Our impact'], ['programmes', 'Programmes'], ['donate', 'Ways to give'], ['events', 'Events'], ['team', 'The team'], ['newsletter', 'Updates by email']],
  launch: [['waitlist', 'Waitlist sign-up'], ['features', 'What it will do'], ['faq', 'FAQ'], ['about', 'About the team']],
  community: [['join', 'Sign-up and joining steps'], ['benefits', 'What members get'], ['safety', 'Safety and verification'], ['pricing', 'Membership prices'], ['faq', 'FAQ']],
}

/** What to ask for this request. Answers the request already gave are not asked again. */
export function questionsFor(prompt: string): Question[] {
  const out: Question[] = []
  if (!nameInPrompt(prompt)) out.push({ id: 'name', text: 'What is the business or site called?', type: 'text', placeholder: 'Type the name', options: [{ value: '', label: 'Pick a name for me' }] })
  if (!guessKind(prompt)) out.push({ id: 'kind', text: 'What kind of site is this?', type: 'single', options: SITE_TYPES.map((t) => ({ value: t.id, label: t.label })) })
  out.push({ id: 'audience', text: 'Who is it mainly for?', type: 'single', options: ['Local customers', 'Businesses', 'Families', 'Young people', 'Everyone'].map((v) => ({ value: v, label: v })) })
  return out
}

export const siteKind = (prompt: string, answers: Record<string, any>) => String(answers.kind || guessKind(prompt) || 'business')

/** Asked last, because it depends on the kind of site */
export function includeQuestion(prompt: string, answers: Record<string, any>): Question {
  const list = INCLUDE[siteKind(prompt, answers)] ?? INCLUDE.business
  return { id: 'include', text: 'What should it include? Pick as many as you like.', type: 'multi', options: list.map(([value, label]) => ({ value: label, label })) }
}

const HERO_NAMES: Record<string, [string, string]> = {
  action: ['Task first', 'Headline with a form beside it'],
  centered: ['Big headline', 'Large centred words over a photo'],
  search: ['Search first', 'A search box takes centre stage'],
  countdown: ['Countdown', 'Date, place and a live timer'],
  split: ['Side by side', 'Words on one side, photo on the other'],
  mosaic: ['Photo mosaic', 'Several photos beside the headline'],
  statement: ['Bold statement', 'Oversized type, very little else'],
  product: ['Product spotlight', 'One product, price and buy button'],
  editorial: ['Magazine front', 'A lead story with the latest beside it'],
}
const FALLBACK_HEROES = ['split', 'centered', 'statement']

export interface DesignOptions { heroes: { id: string; label: string; text: string }[]; colors: ColorOption[] }

/** Up to three home pages that suit the site, and three colour schemes; the first of each is the default */
export function designOptions(prompt: string, answers: Record<string, any>): DesignOptions {
  const kind = SITE_TYPES.find((t) => t.id === siteKind(prompt, answers)) ?? SITE_TYPES[0]
  const key = displayName(prompt, answers) + prompt
  const pool = [...new Set([...kind.heroes, ...FALLBACK_HEROES])].filter((h) => heroByLayout(h))
  const from = seed(`${key}|heroes`) % Math.max(1, kind.heroes.length)
  const ordered = [...pool.slice(from, kind.heroes.length), ...pool.slice(0, from), ...pool.slice(kind.heroes.length)]
  return {
    heroes: ordered.slice(0, 3).map((id) => ({ id, label: HERO_NAMES[id]?.[0] ?? id, text: HERO_NAMES[id]?.[1] ?? '' })),
    colors: colorOptions(pickPlaybook(prompt).id, key),
  }
}

export function displayName(prompt: string, answers: Record<string, any>): string {
  return String(answers.name || nameInPrompt(prompt) || '').trim().slice(0, 40)
}

/** The request as a sentence for the preview's opening line */
function leadLine(prompt: string): string {
  const s = prompt.replace(/\s+/g, ' ').trim()
    .replace(/^(please\s+)?(can you\s+)?((build|create|make|design|generate|i want|i need|give)\s+)?(me\s+|us\s+)?(a\s+|an\s+|my\s+)?(website|site|web ?app|landing page|page)\s+(for\s+)?(a\s+|an\s+|my\s+|our\s+)?/i, '')
  const first = s.split(/(?<=[.!?])\s/)[0].slice(0, 140)
  return first ? `${first[0].toUpperCase()}${first.slice(1)}${/[.!?]$/.test(first) ? '' : '.'}` : ''
}

const HEADLINE: Record<string, (n: string) => string> = {
  business: (n) => `${n}, care you can count on`,
  store: (n) => `Shop the ${n} collection`,
  software: (n) => `${n} makes it simple`,
  portfolio: (n) => `Selected work by ${n}`,
  events: (n) => `Join us at ${n}`,
  calendar: (n) => `What's on at ${n}`,
  content: (n) => `Stories from ${n}`,
  quiz: (n) => `Find your answer with ${n}`,
  directory: (n) => `Find what you need on ${n}`,
  nonprofit: (n) => `Help ${n} do more`,
  launch: (n) => `${n} is coming soon`,
  community: (n) => `Join the ${n} community`,
}

const link = (label: string, href = '#') => ({ label, href })

/** Stand-in words for each section type: the real ones are written when the site is built */
function sampleSection(type: string, name: string): any {
  const y = new Date().getFullYear() + 1
  const items = (titles: string[], extra: (i: number) => any = () => ({})) => titles.map((title, i) => ({ title, text: 'A sentence about this goes here, written for your business when the site is built.', ...extra(i) }))
  const SAMPLES: Record<string, any> = {
    trust: { items: [['badge-check', 'Trusted'], ['clock', 'Open six days'], ['star', 'Top rated'], ['shield-check', 'Guaranteed']].map(([icon, title]) => ({ icon, title, text: 'A short proof point' })) },
    logos: { title: 'Trusted by', names: ['Northwind', 'Meridian', 'Atlas', 'Harbour', 'Summit', 'Crescent'] },
    features: { eyebrow: 'What you get', title: `Why people choose ${name}`, intro: 'Your real services and strengths appear here.', items: items(['Your first strength', 'Your second strength', 'Your third strength', 'Your fourth strength', 'Your fifth strength', 'Your sixth strength'], (i) => ({ icon: ['sparkles', 'star', 'clock', 'shield-check', 'heart', 'badge-check'][i] })) },
    steps: { eyebrow: 'How it works', title: 'Three simple steps', items: items(['Get in touch', 'We plan it together', 'Enjoy the result']) },
    split: { items: [{ eyebrow: 'About', title: `The story of ${name}`, text: 'Your story, your values and what makes you different go here, in your own voice.', points: ['A real strength', 'A real difference', 'A real promise'], photo: '2', button: link('Learn more') }] },
    cards: { eyebrow: 'Popular', title: 'A few favourites', link: link('See all'), items: ['First item', 'Second item', 'Third item'].map((title, i) => ({ title, photo: String(i + 2), meta: ['Detail'], text: 'A short description of this item.', price: 'Price', button: link('View') })) },
    stats: { eyebrow: 'In numbers', title: `${name} at a glance`, photo: '3', items: [['12', 'Years'], ['4,800+', 'Customers'], ['6', 'Locations'], ['4.9', 'Rating']].map(([value, label]) => ({ value, label })) },
    gallery: { eyebrow: 'Gallery', title: 'A look around', items: [2, 3, 4, 5, 6].map((p) => ({ photo: String(p), caption: 'A caption' })) },
    quotes: { eyebrow: 'Reviews', title: 'What people say', items: ['Ayesha Khan', 'Bilal Ahmed', 'Hira Malik'].map((n) => ({ quote: 'A real customer quote will go here, once you have one to share.', name: n, role: 'Customer', rating: 5 })) },
    faq: { eyebrow: 'Questions', title: 'Good to know', items: ['How do I get started?', 'How much does it cost?', 'Where are you based?', 'How quickly can you help?'].map((q) => ({ q, a: 'The answer to this question goes here.' })) },
    duo: { panels: [{ eyebrow: 'For customers', title: 'Get started today', text: 'What this group gets.', photo: '3', button: link('Start') }, { eyebrow: 'For partners', title: 'Work with us', text: 'What this group gets.', button: link('Talk to us') }] },
    pricing: { eyebrow: 'Prices', title: 'Simple pricing', plans: ['Starter', 'Popular', 'Complete'].map((n, i) => ({ name: n, price: 'PKR 0,000', period: '/month', text: 'Who this suits', features: ['A feature', 'A feature', 'A feature'], button: link('Choose'), featured: i === 1 })) },
    menu: { eyebrow: 'Menu', title: 'Fresh every day', groups: ['Favourites', 'Specials'].map((n) => ({ name: n, items: ['First dish', 'Second dish', 'Third dish'].map((d) => ({ name: d, text: 'What is in it.', price: 'PKR 000' })) })) },
    team: { eyebrow: 'The team', title: 'The people behind it', items: ['Sana Iqbal', 'Faisal Raza', 'Mehwish Ali'].map((n) => ({ name: n, role: 'Role', text: 'A line about this person.' })) },
    timeline: { eyebrow: 'Our story', title: 'How we got here', items: ['2018', '2021', '2024'].map((when) => ({ when, title: 'A milestone', text: 'What happened.' })) },
    comparison: { eyebrow: 'Why us', title: `${name} compared`, columns: [name, 'Others'], rows: ['A real difference', 'Another difference', 'A third difference'].map((label) => ({ label, values: [true, false] })) },
    contact: { eyebrow: 'Get in touch', title: 'We would love to hear from you', text: 'Your contact details appear here.', details: [{ icon: 'phone', label: 'Phone', value: 'Your number' }, { icon: 'mail', label: 'Email', value: 'Your email' }], form: { fields: [{ label: 'Name' }, { label: 'Email', type: 'email' }, { label: 'Message', type: 'textarea' }], button: 'Send' } },
    newsletter: { title: 'Stay in the loop', text: 'One useful email a month.', button: 'Subscribe', note: 'No spam.' },
    cta: { title: `Ready to get started with ${name}?`, text: 'One clear next step for your visitors.', primary: link('Get started'), secondary: link('Contact us'), photo: '4' },
    'blog-index': { eyebrow: 'Latest', title: 'Fresh from the journal', link: link('All stories'), posts: ['Your first story', 'Your second story', 'Your third story', 'Your fourth story'].map((title, i) => ({ title, href: 'https://example.com', photo: String(i + 2), category: i % 2 ? 'Guides' : 'News', date: '12 March', readTime: '5 min read', text: 'A one-line teaser for this story.' })) },
    quiz: { eyebrow: 'Two minutes', title: 'Take the quiz', intro: 'Your real questions are written when the site is built.', start: 'Start the quiz', photo: '3', questions: [{ q: 'Your first question goes here', options: [{ label: 'One answer', correct: true }, { label: 'Another answer' }] }, { q: 'Your second question goes here', options: [{ label: 'One answer' }, { label: 'Another answer', correct: true }] }] },
    'events-list': { eyebrow: 'What\'s on', title: 'Coming up', link: link('Full calendar'), events: ['Your first event', 'Your second event', 'Your third event'].map((title, i) => ({ title, date: `${y}-0${i + 1}-1${i + 2}`, time: '19:30', venue: 'Your venue', category: i ? 'Music' : 'Talks', price: 'PKR 000', text: 'A line about this event.', photo: String(i + 2), ticket: link('Tickets') })) },
    'event-schedule': { eyebrow: 'Programme', title: 'The schedule', days: [{ slots: ['Doors open', 'Opening talk', 'Main event'].map((title, i) => ({ time: `${i + 9}:00`, title, room: 'Main hall' })) }] },
    rsvp: { eyebrow: 'Join us', title: 'Save your seat', text: 'Replies go straight to your Leads inbox.', button: 'Reserve my seat' },
  }
  return SAMPLES[type] ?? null
}

function heroSample(layout: string, kindId: string, name: string, prompt: string, photos: string[]): any {
  const title = (HEADLINE[kindId] ?? HEADLINE.business)(name)
  const base = { eyebrow: 'Your site preview', title, accent: name, lead: leadLine(prompt) || 'Your opening line goes here.', primary: link('Get started'), secondary: link('Learn more') }
  const stats = [{ value: '12', label: 'Years' }, { value: '4,800+', label: 'Customers' }, { value: '4.9', label: 'Rating' }]
  switch (layout) {
    case 'action': return { ...base, stats, action: { title: 'Get started', fields: [{ label: 'What do you need?', options: ['Option one', 'Option two'] }, { label: 'When?', type: 'date' }], button: 'Continue', href: 'contact' }, points: ['A real promise', 'A real strength'] }
    case 'search': return { ...base, action: { fields: [{ label: 'What', placeholder: 'What are you looking for?' }, { label: 'Where', placeholder: 'Anywhere' }], button: 'Search', href: 'listings' }, chips: ['Popular', 'Near you', 'New'] }
    case 'countdown': return { ...base, date: `${new Date().getFullYear() + 1}-03-04T10:00`, when: 'Your date', venue: 'Your venue' }
    case 'statement': return { ...base, action: { fields: [{ label: 'Email', name: 'email', type: 'email', placeholder: 'you@example.com' }], button: 'Join', href: 'thanks' }, photo: photos[1] }
    case 'product': return { ...base, photo: photos[1], price: 'PKR 0,000', rating: 'Top rated', points: ['A real benefit', 'Free delivery', 'Easy returns'] }
    case 'editorial': return { ...base, tag: 'Featured', primary: link('Read the story'), eyebrow: 'Latest', stories: ['Your second story', 'Your third story', 'Your fourth story'].map((t, i) => ({ tag: 'News', title: t, href: 'https://example.com', photo: String(i + 3) })) }
    case 'mosaic': return { ...base, stats: stats.slice(0, 2), photos: ['2', '3', '4'] }
    default: return { ...base, stats }
  }
}

export interface PreviewInput {
  prompt: string
  answers: Record<string, any>
  hero?: string
  color?: number
  photos?: string[]
}

/** The photos used until the real ones are chosen at build time */
const stockPhotos = (key: string) => [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `https://picsum.photos/seed/${seed(key) + n}/1400/900`)

function previewKit(input: PreviewInput): { kit: BrandKit; name: string; kindId: string; layout: string } {
  const options = designOptions(input.prompt, input.answers)
  const kindId = siteKind(input.prompt, input.answers)
  const name = displayName(input.prompt, input.answers) || 'Your Brand'
  const photos = input.photos?.length ? input.photos : stockPhotos(input.prompt)
  const color = options.colors[input.color ?? 0] ?? options.colors[0]
  const layout = input.hero && heroByLayout(input.hero) ? input.hero : options.heroes[0].id
  const kit = buildBrandKit({
    brief: `BRAND NAME: ${name}\nDESCRIPTOR: ${pickPlaybook(input.prompt).label.split(/[,&]/)[0].trim()}\nSITE TYPE: ${kindId}`,
    prompt: input.prompt, fallbackName: name, heroPhoto: photos[0], photos,
    design: { brandHex: color.brandHex, page: color.page, bands: color.bands, hero: layout, siteType: kindId },
  })
  return { kit, name, kindId, layout }
}

export interface PreviewBundle {
  /** The page around the content, loaded once */
  shell: string
  /** Each colour scheme's stylesheet is prefix + middles[i] + suffix: only the colours differ */
  css: { prefix: string; suffix: string; middles: string[] }
  /** Each home page's content */
  pages: Record<string, string>
  options: DesignOptions
}

// Links go nowhere here: the preview is one page, and a real click would leave it.
// The conversation swaps colours, home pages and the logo by message, with no request at all.
const PREVIEW_SCRIPT = `<script>
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a,button[type=submit]');if(a)e.preventDefault()});
document.addEventListener('submit',function(e){e.preventDefault()});
var shown={};
addEventListener('message',function(e){var d=e.data||{};
  if(d.css!=null&&d.css!==shown.css){document.getElementById('kit-css').textContent=d.css;shown.css=d.css}
  if(d.main!=null&&d.main!==shown.main){document.querySelector('main').innerHTML=d.main;shown.main=d.main}
  if(d.logo!==shown.logo){shown.logo=d.logo;document.querySelectorAll('.brand-mark').forEach(function(m){
    if(m.__t==null)m.__t=m.textContent;
    if(d.logo){var i=new Image();i.alt='';i.src=d.logo;m.textContent='';m.appendChild(i);m.classList.add('has-logo')}
    else{m.textContent=m.__t;m.classList.remove('has-logo')}})}
});
</script>`

function sharedEdges(parts: string[]): { prefix: string; suffix: string; middles: string[] } {
  const first = parts[0]
  let start = 0
  while (start < first.length && parts.every((c) => c[start] === first[start])) start++
  let end = 0
  while (end < first.length - start && parts.every((c) => c.length - end - 1 >= start && c[c.length - end - 1] === first[first.length - end - 1])) end++
  return { prefix: first.slice(0, start), suffix: end ? first.slice(first.length - end) : '', middles: parts.map((c) => c.slice(start, c.length - end)) }
}

/** Everything the preview needs for every choice, built once with no AI. The browser does the rest. */
export function renderPreviewBundle(input: PreviewInput): PreviewBundle {
  const options = designOptions(input.prompt, input.answers)
  const branded = (hero: string) => {
    const { kit, name, kindId, layout } = previewKit({ ...input, hero, color: 0 })
    const tags = [
      `<forge-hero layout="${layout}">${JSON.stringify(heroSample(layout, kindId, name, input.prompt, kit.photos))}</forge-hero>`,
      ...kit.plan.sections.slice(0, 5).map((s) => ({ s, c: sampleSection(s.type, name) })).filter((x) => x.c).map(({ s, c }) => `<forge-section type="${s.type}" variant="${s.variant}">${JSON.stringify(c)}</forge-section>`),
    ].join('\n')
    const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${name}</title><style id="kit-css"></style><style>@media (max-width: 820px) { .site-header .nav-links { display: none !important; } }</style></head><body><header class="site-header"><a href="#" class="nav-brand"></a><nav class="nav-links"><a href="#">Home</a><a href="#">About</a><a href="#">Services</a><a href="#">Contact</a></nav><a class="nav-cta" href="#">Get started</a></header><main>${expandSections(tags, kit, 'html').content}</main><footer class="site-footer"><div class="container"><p>© ${new Date().getFullYear()} ${name}</p></div></footer>${PREVIEW_SCRIPT}</body></html>`
    return applyBrandToHtml(page, kit)
  }
  const MAIN = /<main>([\s\S]*)<\/main>/
  const pagesHtml = options.heroes.map((h) => ({ id: h.id, html: branded(h.id) }))
  const pages: Record<string, string> = {}
  for (const { id, html } of pagesHtml) pages[id] = MAIN.exec(html)?.[1] ?? ''
  const css = options.colors.map((_c, i) => {
    const { kit } = previewKit({ ...input, hero: options.heroes[0].id, color: i })
    return mirrorForRtl(finalizeBrandCss(getPackCss(kit.mode === 'dark' ? 'dark' : 'clean'), kit, { fontImport: true }), kit)
  })
  return { shell: pagesHtml[0].html.replace(MAIN, () => '<main></main>'), css: sharedEdges(css), pages, options }
}

/** The request the AI receives: the first message plus everything the client chose */
export function composePrompt(prompt: string, answers: Record<string, any>, notes: string[]): string {
  const lines = [prompt.trim()]
  const name = displayName(prompt, answers)
  if (answers.name && name) lines.push(`The business is called ${name}.`)
  if (answers.audience) lines.push(`It is mainly for: ${answers.audience}.`)
  if (Array.isArray(answers.include) && answers.include.length) lines.push(`It must include: ${answers.include.join(', ')}.`)
  if (notes.length) lines.push(`The client also asked: ${notes.join(' ')}`)
  return lines.join('\n')
}

