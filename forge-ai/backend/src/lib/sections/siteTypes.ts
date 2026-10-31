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
      { type: 'event-schedule', note: 'the programme, by day when it runs several' },
      { type: 'team', note: 'speakers, performers or hosts' },
      { type: 'pricing', note: 'tickets, middle option featured', variants: ['cards'] },
      { type: 'faq', note: 'travel, tickets, accessibility, refunds' },
      CLOSE,
    ],
    pages: 'Programme page: event-schedule + team. Tickets page: pricing + rsvp + faq. Venue page: split + contact (map).',
  },
  {
    id: 'calendar', label: 'Venue or events calendar', fits: 'runs many events over time: a comedy club, arts centre, class or workshop series, meet-up group, sports league', heroes: ['centered', 'split', 'mosaic'],
    recipe: [
      { type: 'events-list', note: 'the next 5–8 events, each with a date, time and price — with a "link" to the full calendar' },
      { type: 'features', note: 'what makes a night here worth it' },
      { type: 'gallery', note: 'past nights, 5–8 photos with captions' },
      { type: 'quotes', note: 'people who came' },
      { type: 'newsletter', note: 'hear about new events first' },
      CLOSE,
    ],
    pages: 'Events page: events-list of every event (variant cards or agenda). Up to 3 event pages (the biggest events): event-detail, then rsvp when it is free to attend or pricing when it is ticketed. Visit page: split + contact (map) + faq. About page: split + team.',
  },
  {
    id: 'content', label: 'Blog or magazine', fits: 'publishes articles, recipes, guides or news', heroes: ['editorial', 'statement'],
    recipe: [
      { type: 'blog-index', note: 'the latest 4–6 stories, each linking to its own article page — with a "link" to all stories', variants: ['magazine', 'grid'] },
      { type: 'split', note: 'about the writer or the publication', variants: ['alternate', 'overlap'] },
      { type: 'features', note: 'the topics this publication covers, each with an icon' },
      { type: 'quotes', note: 'what readers say' },
      { type: 'newsletter', note: 'subscribe for new stories' },
      CLOSE,
    ],
    pages: 'Articles page: blog-index of every story, variant grid or list. One article page per story (4 or 5 in all): an article section (500+ words of real writing), then a blog-index of the 3 most related stories, then cta. About page: split + team. Contact page: contact.',
  },
  {
    id: 'quiz', label: 'Quiz or assessment', fits: 'the visitor takes a quiz, test or assessment and gets a result: trivia, "which one suits you", a skin or fitness check, a lead-generation quiz', heroes: ['centered', 'statement', 'split'],
    recipe: [
      { type: 'quiz', note: 'the quiz itself, 6–10 questions, straight after the opener; the opener\'s main button has href "#quiz" and jumps to it' },
      { type: 'features', note: 'what the visitor gets from their result' },
      { type: 'stats', note: 'people who took it, questions, minutes, rating' },
      { type: 'quotes', note: 'what people did with their result' },
      { type: 'faq', note: 'how it works, how long it takes, what happens to their answers' },
      CLOSE,
    ],
    pages: 'More quizzes page: cards of other quizzes, when the site offers several, each opening its own page with one quiz section. About page: split + team. Contact page: contact.',
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
