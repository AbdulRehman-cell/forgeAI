// What a site DOES, chosen by the art director: it decides which openers fit and,
// for sites that are not a local business, the landing recipe. The industry
// playbook (blocks.ts) supplies the recipe for businesses, shops and software.

export interface Slot {
  type: string
  /** What this section holds on this kind of site */
  note: string
  /** Variants that suit this slot; any variant of the type when omitted */
  variants?: string[]
}

export interface SiteType {
  id: string
  label: string
  /** One line for the art director's list */
  fits: string
  /** Openers that suit it */
  heroes: string[]
  /** Its own landing recipe; businesses, shops and software use the industry playbook's */
  recipe?: Slot[]
  pages?: string
}

const CLOSE: Slot = { type: 'cta', note: 'closing band with the two main actions' }

export const SITE_TYPES: SiteType[] = [
  { id: 'business', label: 'Local business', fits: 'a business people visit, book, call or ask for a quote (salon, clinic, restaurant, trades, agency, hotel)', heroes: ['action', 'split', 'centered', 'mosaic', 'search'] },
  { id: 'store', label: 'Online shop', fits: 'sells products online', heroes: ['product', 'mosaic', 'split', 'centered'] },
  { id: 'software', label: 'Software or app', fits: 'a SaaS product, app, AI tool or platform', heroes: ['split', 'statement', 'centered'] },
  {
    id: 'portfolio', label: 'Portfolio', fits: 'shows the work of a creative person or studio (photographer, architect, designer)', heroes: ['mosaic', 'statement', 'split'],
    recipe: [
      { type: 'gallery', note: 'selected work, 6–8 photos with captions' },
      { type: 'split', note: 'about — the person or studio and the approach', variants: ['alternate', 'overlap'] },
      { type: 'steps', note: 'how a project runs, from brief to delivery' },
      { type: 'quotes', note: 'clients' },
      CLOSE,
    ],
    pages: 'Work page: gallery + cards of projects. About page: split + team + timeline. Contact page: contact.',
  },
  {
    id: 'events', label: 'Event', fits: 'one event or festival: a conference, concert, wedding, race, exhibition', heroes: ['countdown', 'centered'],
    recipe: [
      { type: 'trust', note: 'date, venue, who it is for, what is included' },
      { type: 'features', note: 'what to expect' },
      { type: 'timeline', note: 'the programme — "when" holds the time of day' },
      { type: 'team', note: 'speakers, performers or hosts' },
      { type: 'pricing', note: 'tickets, middle option featured', variants: ['cards'] },
      { type: 'faq', note: 'travel, tickets, accessibility, refunds' },
      CLOSE,
    ],
    pages: 'Programme page: timeline + team. Tickets page: pricing + faq. Venue page: split + contact (map).',
  },
  {
    id: 'content', label: 'Blog or magazine', fits: 'publishes articles, recipes, guides or news', heroes: ['editorial', 'statement'],
    recipe: [
      { type: 'cards', note: 'latest stories: photo, badge = category, meta = [date, read time], title, one-line teaser, button "Read" — with a "link" to all stories', variants: ['grid', 'overlay'] },
      { type: 'split', note: 'about the writer or the publication', variants: ['alternate', 'overlap'] },
      { type: 'cards', note: 'most popular stories', variants: ['list'] },
      { type: 'newsletter', note: 'subscribe for new stories' },
      CLOSE,
    ],
    pages: 'Articles page: cards of every story. Each article page: page hero, then the story as split sections, then cards of related stories. About page: split + team.',
  },
  {
    id: 'directory', label: 'Directory or marketplace', fits: 'people search listings others offer: a jobs board, property portal, venue finder', heroes: ['search', 'action'],
    recipe: [
      { type: 'cards', note: 'featured listings with photo, badge, meta, price and a "link" to all listings' },
      { type: 'features', note: 'browse by category, each with an icon' },
      { type: 'steps', note: 'how it works for people searching' },
      { type: 'stats', note: 'listings, members, places, rating' },
      { type: 'duo', note: 'people searching (photo) and people listing' },
      { type: 'quotes', note: 'users' },
      CLOSE,
    ],
    pages: 'Listings page: cards with filters above. Listing owners page: features + pricing + faq. Contact page: contact.',
  },
  {
    id: 'nonprofit', label: 'Charity or community group', fits: 'a charity, mosque, church, club or cause asking for support', heroes: ['centered', 'split', 'action'],
    recipe: [
      { type: 'stats', note: 'impact in numbers' },
      { type: 'split', note: 'the mission and the people it helps' },
      { type: 'features', note: 'programmes or ways to help' },
      { type: 'timeline', note: 'the story so far' },
      { type: 'quotes', note: 'people helped and volunteers' },
      { type: 'newsletter', note: 'updates from the work' },
      CLOSE,
    ],
    pages: 'About page: split + team + timeline. Get involved page: features + steps + faq. Donate or contact page: pricing (list of giving amounts) + contact.',
  },
  {
    id: 'launch', label: 'Launch page', fits: 'something not open yet — a waitlist, pre-order or coming-soon page', heroes: ['statement', 'split'],
    recipe: [
      { type: 'features', note: 'what it will do' },
      { type: 'split', note: 'the problem it solves, shown in use' },
      { type: 'steps', note: 'how it will work' },
      { type: 'faq', note: 'launch date, price, who it is for' },
      { type: 'newsletter', note: 'join the waitlist' },
      CLOSE,
    ],
    pages: 'About page: split + team. FAQ page: faq. Contact page: contact.',
  },
  {
    id: 'community', label: 'Membership or community', fits: 'members sign up and meet each other: a dating site, forum, club or network', heroes: ['centered', 'split', 'mosaic'],
    recipe: [
      { type: 'features', note: 'what members get' },
      { type: 'steps', note: 'how joining works' },
      { type: 'stats', note: 'members, matches or meet-ups, places, rating' },
      { type: 'split', note: 'safety and how members are verified' },
      { type: 'quotes', note: 'members' },
      { type: 'faq', note: 'cost, privacy, safety, who can join' },
      CLOSE,
    ],
    pages: 'How it works page: steps + features + faq. Safety page: split + features. Join page: pricing + faq.',
  },
]

export const DEFAULT_SITE_TYPE = SITE_TYPES[0]

/** The art director's choice, or what the industry implies. */
export function pickSiteType(asked: string, industry: string): SiteType {
  const id = asked.toLowerCase().match(/[a-z]+/)?.[0] ?? ''
  return SITE_TYPES.find((t) => t.id === id)
    ?? (industry === 'retail' ? SITE_TYPES.find((t) => t.id === 'store') : industry === 'saas' ? SITE_TYPES.find((t) => t.id === 'software') : undefined)
    ?? DEFAULT_SITE_TYPE
}
