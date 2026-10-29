import { ICONS } from './icons.data'

export const ICON_NAMES = Object.keys(ICONS)

// Words models reach for that have no icon of their own
const ALIASES: Record<string, string> = {
  tooth: 'smile', dental: 'smile', dentist: 'smile', teeth: 'smile', medical: 'stethoscope', doctor: 'stethoscope', clinic: 'hospital',
  health: 'heart-pulse', care: 'hand-heart', love: 'heart', support: 'headphones', help: 'headphones', chat: 'message-circle',
  email: 'mail', envelope: 'mail', location: 'map-pin', address: 'map-pin', pin: 'map-pin', time: 'clock', hours: 'clock',
  date: 'calendar', booking: 'calendar-check', appointment: 'calendar-check', schedule: 'calendar-days', delivery: 'truck',
  shipping: 'truck', money: 'banknote', price: 'tag', pricing: 'tag', payment: 'credit-card', secure: 'shield-check',
  security: 'shield-check', safe: 'shield-check', insurance: 'shield', quality: 'badge-check', verified: 'badge-check',
  certified: 'award', experience: 'award', team: 'users', people: 'users', community: 'users', customer: 'user', person: 'user',
  fast: 'zap', speed: 'zap', quick: 'zap', growth: 'trending-up', results: 'trending-up', analytics: 'bar-chart-3',
  chart: 'bar-chart-3', data: 'bar-chart-3', idea: 'lightbulb', launch: 'rocket', code: 'code-xml', dev: 'code-xml',
  tools: 'wrench', repair: 'wrench', build: 'hammer', construction: 'hard-hat', food: 'utensils', restaurant: 'utensils',
  menu: 'utensils', bakery: 'croissant', bread: 'croissant', cake: 'cake-slice', drink: 'glass-water', bar: 'wine',
  hotel: 'bed-double', room: 'bed-double', bed: 'bed-double', travel: 'plane', flight: 'plane', world: 'globe', web: 'globe',
  photo: 'camera', gallery: 'image', fitness: 'dumbbell', gym: 'dumbbell', sport: 'trophy', win: 'trophy', goal: 'target',
  education: 'graduation-cap', learn: 'book-open', course: 'book-open', book: 'book-open', law: 'scale', legal: 'scale',
  finance: 'landmark', bank: 'landmark', savings: 'piggy-bank', pet: 'paw-print', pets: 'paw-print', nature: 'leaf',
  eco: 'recycle', green: 'leaf', garden: 'flower-2', plant: 'sprout', beauty: 'sparkles', spa: 'sparkles', hair: 'scissors',
  salon: 'scissors', fashion: 'shirt', clothing: 'shirt', jewellery: 'gem', jewelry: 'gem', luxury: 'gem', event: 'party-popper',
  events: 'party-popper', tickets: 'ticket', news: 'newspaper', blog: 'newspaper', article: 'file-text', marketing: 'megaphone',
  music: 'music', video: 'video', play: 'circle-play', search: 'search', like: 'thumbs-up', check: 'circle-check',
  done: 'circle-check', tick: 'circle-check', timer: 'timer', recycle: 'recycle', design: 'palette', art: 'palette',
  furniture: 'sofa', home: 'home', house: 'home', property: 'building-2', building: 'building-2', office: 'building-2',
  warehouse: 'warehouse', logistics: 'forklift', shop: 'store', store: 'store', cart: 'shopping-cart', bag: 'shopping-bag',
  school: 'school', church: 'church', mosque: 'landmark', hospital: 'hospital', emergency: 'ambulance', vision: 'eye',
  mind: 'brain', therapy: 'brain', mobile: 'smartphone', phone: 'phone', app: 'smartphone', computer: 'laptop',
  cloud: 'cloud', server: 'server', notification: 'bell', send: 'send', map: 'map', directions: 'route', car: 'car',
  parking: 'car-front', fuel: 'fuel', farm: 'tractor', key: 'key-round', access: 'door-open', accessibility: 'accessibility',
  wifi: 'wifi', gift: 'gift', discount: 'percent', sale: 'percent', star: 'star', rating: 'star', review: 'star',
  handshake: 'handshake', partner: 'handshake', trust: 'handshake', charity: 'hand-heart', donate: 'hand-coins',
  science: 'microscope', lab: 'flask-conical', game: 'gamepad-2', gaming: 'gamepad-2', puzzle: 'puzzle', beach: 'umbrella',
  winter: 'snowflake', coffee: 'coffee', pizza: 'pizza', meat: 'beef', fish: 'fish', vegan: 'salad', organic: 'leaf',
}

/** The closest icon for whatever name the model wrote; a check mark when nothing fits. */
export function resolveIcon(name: unknown): string {
  const key = String(name ?? '').toLowerCase().trim().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '')
  if (!key) return 'circle-check'
  if (ICONS[key]) return key
  if (ALIASES[key]) return ALIASES[key]
  const words = key.split('-').filter(Boolean)
  for (const w of words) {
    const singular = w.replace(/(ies)$/, 'y').replace(/s$/, '')
    if (ICONS[w]) return w
    if (ALIASES[w]) return ALIASES[w]
    if (ALIASES[singular]) return ALIASES[singular]
  }
  return ICON_NAMES.find((n) => words.some((w) => w.length > 3 && n.includes(w))) ?? 'circle-check'
}

/** A 24×24 line icon. JSX needs camelCase attributes and self-closing tags (the data already self-closes). */
export function iconSvg(name: unknown, flavour: 'html' | 'jsx'): string {
  const inner = ICONS[resolveIcon(name)]
  const attrs = flavour === 'jsx'
    ? 'strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"'
    : 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
  return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" ${attrs} aria-hidden="true">${inner}</svg>`
}
