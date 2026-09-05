import { Router } from 'express'
import axios from 'axios'
import multer from 'multer'
import * as XLSX from 'xlsx'
import { promises as dns } from 'dns'
import { google } from 'googleapis'
import { requireAuth } from '../../middleware/auth.middleware'
import { User } from '../users/user.model'
import { Prospect, ProspectStatus, EmailTone, IProspect } from './prospect.model'
import { OutreachTemplate } from './outreach-template.model'
import { createProvider } from '../ai/ai.factory'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })
router.use(requireAuth)

// ─── Helpers ──────────────────────────────────────────────────

function getAI() {
  try { return createProvider('claude') } catch {
    try { return createProvider('gemini') } catch {
      return createProvider('github')
    }
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000)
}

type EmailQuality = 'personal' | 'role' | 'generic'
interface ScoredEmail { email: string; quality: EmailQuality }

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com','guerrillamail.com','tempmail.com','throwam.com','yopmail.com',
  'sharklasers.com','guerrillamailblock.com','grr.la','guerrillamail.info',
  'spam4.me','trashmail.com','dispostable.com','maildrop.cc','fakeinbox.com',
  '10minutemail.com','getairmail.com','discard.email','mailnull.com','spamgourmet.com',
  'spamgourmet.net','spamgourmet.org','trashmail.at','trashmail.io','trashmail.me',
])

// Platform / service domains — internal emails that appear in page source but are not contact emails
const SERVICE_DOMAINS = new Set([
  'sentry.io','sentry.com','cloudflare.com','cloudflare.net','amazonaws.com',
  'googletagmanager.com','google-analytics.com','googleapis.com','goog.com',
  'facebook.com','instagram.com','twitter.com','tiktok.com','linkedin.com',
  'example.com','example.org','example.net','w3.org','schema.org',
  'wixpress.com','squarespace.com','shopify.com','wordpress.com','weebly.com',
  'typeform.com','hubspot.com','mailchimp.com','sendgrid.net','sendgrid.com',
  // Sports club platform support addresses — never a real club contact email
  'pitchero.com','clubspark.com','clubbuzz.co.uk','playmetrics.com','teamer.net',
])

const ROLE_LOCALS = new Set([
  'info','contact','hello','hi','mail','email','team','sales','marketing','press',
  'media','hr','careers','jobs','billing','accounts','office','general','inquiry',
  'enquiry','enquiries','inquiries','feedback','webmaster','web','administration',
  'admin','administrator','service','services','customer','help','support','abuse',
  'hostmaster','postmaster','root','security','privacy','legal','compliance','dpo',
  'gdpr','noreply','no-reply','donotreply','bounces','notifications','newsletter',
])

// Placeholder / example email locals to reject
const PLACEHOLDER_LOCALS = new Set(['user', 'test', 'name', 'email', 'example', 'your'])
const PLACEHOLDER_DOMAINS = new Set(['domain.com', 'example.com', 'example.org', 'example.net', 'yourdomain.com', 'yourdomain.co.uk', 'company.com'])

function extractEmails(text: string): string[] {
  // Decode HTML entity-encoded emails (e.g. &#104;&#101;&#108;&#108;&#111;&#64;company.com)
  const decoded = text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    // Decode common text obfuscation patterns → real @ and .
    .replace(/\s*[\[({\s]at[\])}]\s*/gi, '@')
    .replace(/\s*[\[({\s]dot[\])}]\s*/gi, '.')
    .replace(/\s+at\s+/gi, '@')
    .replace(/\s+dot\s+/gi, '.')

  // Allow multi-part TLDs like .co.uk by allowing dots in domain portion after @
  const found = decoded.match(/[\w.+\-']+@[\w\-]+(?:\.[\w\-]+)+/g) ?? []
  return [...new Set(found.map(e => e.toLowerCase().replace(/[.,;:!?]+$/, '')).filter(e => {
    const [local, ...domainParts] = e.split('@')
    const domain = domainParts.join('@')
    if (!local || !domain || !domain.includes('.')) return false
    const tld = domain.split('.').pop() ?? ''
    if (tld.length < 2 || tld.length > 6) return false
    if (DISPOSABLE_DOMAINS.has(domain)) return false
    if (SERVICE_DOMAINS.has(domain)) return false
    if (PLACEHOLDER_DOMAINS.has(domain)) return false
    if (PLACEHOLDER_LOCALS.has(local)) return false
    return true
  }))]
}

async function hasMxRecord(domain: string): Promise<boolean> {
  try {
    const records = await dns.resolveMx(domain)
    return records.length > 0
  } catch { return false }
}

async function scoreAndValidateEmails(emails: string[]): Promise<ScoredEmail[]> {
  const results = await Promise.allSettled(
    emails.map(async (email): Promise<ScoredEmail | null> => {
      const [local, domain] = email.split('@')
      if (!local || !domain) return null
      const valid = await hasMxRecord(domain)
      if (!valid) return null
      const quality: EmailQuality = ROLE_LOCALS.has(local.toLowerCase()) ? 'role' : 'personal'
      return { email, quality }
    })
  )
  return results
    .filter((r): r is PromiseFulfilledResult<ScoredEmail> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value)
    .sort((a, b) => (a.quality === 'personal' ? -1 : 1) - (b.quality === 'personal' ? -1 : 1))
}

function extractDocumentText(buffer: Buffer, mimetype: string, originalname: string): string {
  const ext = originalname.split('.').pop()?.toLowerCase() ?? ''

  // Plain text formats
  if (mimetype.startsWith('text/') || ['txt', 'md', 'json', 'csv'].includes(ext)) {
    return buffer.toString('utf-8').slice(0, 8000)
  }

  // Excel / spreadsheet
  if (['xlsx', 'xls', 'ods', 'xlsm'].includes(ext) || mimetype.includes('spreadsheet') || mimetype.includes('excel')) {
    try {
      const wb = XLSX.read(buffer, { type: 'buffer' })
      const lines: string[] = []
      for (const sheetName of wb.SheetNames.slice(0, 3)) {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName])
        lines.push(`[Sheet: ${sheetName}]\n${csv}`)
      }
      return lines.join('\n\n').slice(0, 8000)
    } catch {
      return buffer.toString('utf-8', 0, 4000)
    }
  }

  // PDF — best-effort text extraction from content streams
  if (ext === 'pdf' || mimetype === 'application/pdf') {
    const str = buffer.toString('latin1')
    const texts: string[] = []
    // Extract parenthesis-delimited strings from PDF content streams
    const re = /\(([^)\\]{1,200})\)\s*(?:Tj|TJ|'|")/g
    let m: RegExpExecArray | null
    while ((m = re.exec(str)) !== null) {
      const t = m[1].replace(/\\n/g, ' ').replace(/\\[rnt]/g, ' ').trim()
      if (t.length > 2) texts.push(t)
    }
    const extracted = texts.join(' ').replace(/\s+/g, ' ').trim()
    return extracted.length > 50 ? extracted.slice(0, 8000) : '[PDF content could not be extracted — try a TXT or XLSX file instead]'
  }

  // Fallback
  return buffer.toString('utf-8', 0, 4000)
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuote = !inQuote }
    else if (ch === ',' && !inQuote) { fields.push(cur.trim()); cur = '' }
    else { cur += ch }
  }
  fields.push(cur.trim())
  return fields
}

// ─── Search helpers ────────────────────────────────────────────

const SKIP = /nhs\.uk|wikipedia\.|britannica\.|dictionary\.|cambridge\.org|facebook\.|linkedin\.|instagram\.|twitter\.|google\.|amazon\.|bbc\.|\.gov\b|gov\.uk|bing\.com|microsoft\.|youtube\.|indeed\.com|reed\.co|totaljobs\.|yelp\.|yell\.|tripadvisor\.|fresha\.|booksy\.|cylex|chamberofcommerce\.|checkatrade\.|trustpilot\.|ratedpeople\.|treatwell\.|bark\.com|192\.com|thomsonlocal\.|scoot\.co|opentable\.|justeat\.|deliveroo\.|zomato\.|thefork\.|hardens\.|squaremeal\.|yellowpages\.|whitepages\.|angi\.com|thumbtack\.|avvo\.|zocdoc\.|healthgrades\.|vitals\.|findlaw\.|lawinfo\.|salonsearcher\.|phorest\.|shortlist\.|gumtree\.|restaurantji\.|findhealthclinics\.|lawsociety\.|solicitors\.|barcouncil\.|visitdundee\.|visitscotland\.|visitmanchest|visitbirmingham\.|visitlondon\.|malmaison\.|premierinn\.|travelodge\.|hilton\.|marriott\.|ibis\.|citizensadvice\.|nhsengland\.|rightmove\.|zoopla\.|flashscore\.|livescore\.|sofascore\.|whoscored\.|transfermarkt\.|soccerway\.|skysports\.|eurosport\.|espn\.|talksport\.|btsport\.|sportradar\.|statsperform\.|beinSports\.|dazn\.|nhl\.com|nba\.com|nfl\.com|fifa\.com|fih\.hockey|uefa\.com|icc-cricket\.|rugbyworldcup\.|olympics\.|paralympics\.|wtatennis\.|atptour\.|formula1\.|motogp\.|tennis365\.|planetfootball\.|planetrugby\.|planetsport\.|sportinglife\.|racing\.com|turfanalyst\.|oddschecker\.|betfair\.|betway\.|bet365\.|williamhill\.|ladbrokes\.|coral\.|skybet\.|paddy|sportsbetting\.|schoolchecker\.|apps\.apple\.|play\.google\.|spotify\.|c2kschools\.|englandhockey\.co\.uk|hockeywales\.org|scottishhockey\.org|irishhockey\.ie|hockey\.org\.uk|inyourarea\.co\.uk|localwp\.com|thelocal\.com|msn\.com|yahoo\.|sportsdirect\.|thisisw.*\.co\.uk|advertiser\.co\.uk|herald\.co\.uk|gazette\.co\.uk|chronicle\.co\.uk|observer\.co\.uk|mirror\.co\.uk|telegraph\.co\.uk|theguardian\.|independent\.co\.uk|thetimes\.co\.uk|localsend\.org|towncouncil\.|parishcouncil\.|districtcouncil\.|borough\.gov\.|county\.gov\.|\.gov\.uk|findglocal\.com|playerwanted\.co\.uk|bizseek\.co\.uk|listedlocally\.co\.uk|lancs\.live|compareagentfees\.|onthemarket\.com|primelocation\.com|rightmove\.|zoopla\.|nethouseprices\.|punchng\.com|saharareporters\.|vanguardngr\.|thenation\.|constructionenquirer\.|constructionnews\.|constructionline\.|constructionindex\.|constructionjob|theconstructionindex\.|savills\.|knightfrank\.|jll\.|cbre\.|colliers\.|cushmanwakefield\.|avison|tpos\.co\.uk|firstport\.co\.uk|getagent\.co\.uk|onlinelandregistry\.|conveyancingsupermarket\.|localbuildingsurveyor\.|wisepops\.com|cloudinary\.com|elfsight\.com|w3schools\.com|findstack\.com|stechies\.com|geetest\.com|justwatch\.com|freeview\.co\.uk|bydfi\.com|picreel\.com|proprofs\.com|moonrisesports\.|clubbuzz-assets\.|wordpress\.org\/plugins|wordpress\.org\/themes|cnn\.com|usatoday\.com|foxnews\.com|nbcnews\.com|cbsnews\.com|abcnews\.go\.com|huffpost\.com|buzzfeed\.com|dailymail\.co\.uk|thestar\.com|smh\.com\.au|abc\.net\.au|stuff\.co\.nz|timesofIndia\.|hindustantimes\.|ndtv\.com|aljazeera\.com|reuters\.com|apnews\.com|bloomberg\.com|businessinsider\.|forbes\.com|techcrunch\.com|wired\.com|theverge\.com|engadget\.com|mashable\.com|entrepreneur\.com|inc\.com|hbr\.org|medium\.com|substack\.com|quora\.com|reddit\.com|pinterest\.|tumblr\.com|flickr\.com|vimeo\.com|tiktok\.com|snapchat\.com|whatsapp\.com|telegram\.org|yelp\.com|houzz\.com|angieslist\.|homeadvisor\.|nextdoor\.|pagesjaunes\.|gelbeseiten\.|paginegialle\.|cylex\./i

type SearchResult = { title: string; url: string; snippet: string }

// ── Brave Search API (preferred — free 2k/month, real web results) ────────
async function searchBrave(query: string, maxResults = 10): Promise<SearchResult[]> {
  const key = process.env.BRAVE_SEARCH_KEY
  if (!key) return []
  try {
    const { data } = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      params: { q: query, count: Math.min(maxResults, 20), country: 'GB', search_lang: 'en' },
      headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': key },
      timeout: 12000,
    })
    const webResults: any[] = data?.web?.results ?? []
    const results: SearchResult[] = []
    for (const item of webResults) {
      const rawUrl: string = item.url ?? ''
      if (!rawUrl || SKIP.test(rawUrl)) continue
      let url: string
      try { url = new URL(rawUrl).origin } catch { continue }
      if (results.some(r => r.url === url)) continue
      results.push({ title: item.title ?? '', url, snippet: item.description ?? '' })
    }
    console.log(`[outreach] Brave found ${results.length} results for: ${query.slice(0, 60)}`)
    return results
  } catch (err: any) {
    console.warn(`[outreach] Brave Search error: ${err?.response?.status ?? err?.message}`)
    return []
  }
}

// ── Google Custom Search API (fallback when GOOGLE_CSE_KEY + GOOGLE_CSE_ID are set) ──
async function searchGoogle(query: string, maxResults = 10): Promise<SearchResult[]> {
  const key = process.env.GOOGLE_CSE_KEY
  const cx = process.env.GOOGLE_CSE_ID
  if (!key || !cx) return []
  try {
    const { data } = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: { key, cx, q: query, num: Math.min(maxResults, 10), gl: 'uk', hl: 'en' },
      timeout: 12000,
    })
    const items: any[] = data.items ?? []
    const results: SearchResult[] = []
    for (const item of items) {
      const rawUrl: string = item.link ?? ''
      if (!rawUrl || SKIP.test(rawUrl)) continue
      let url: string
      try { url = new URL(rawUrl).origin } catch { continue }
      if (results.some(r => r.url === url)) continue
      results.push({ title: item.title ?? '', url, snippet: item.snippet ?? '' })
    }
    return results
  } catch (err: any) {
    console.warn(`[outreach] Google CSE error: ${err?.message}`)
    return []
  }
}

// Rotate user-agents so repeated requests look like different browsers
const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
]
let uaIndex = 0
function nextUA() { return UA_POOL[uaIndex++ % UA_POOL.length] }

function parseBingHtml(html: string, maxResults: number): SearchResult[] {
  // Bing wraps parts of URLs in <span> inside <cite> — strip inner tags first
  const citeBlockRe = /<cite[^>]*>([\s\S]*?)<\/cite>/gi
  const titleRe = /<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/gi
  const snippetRe = /class="b_caption"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi
  const cites: string[] = [], titles: string[] = [], snippets: string[] = []
  let m: RegExpExecArray | null
  while ((m = citeBlockRe.exec(html)) !== null) {
    // Strip inner HTML tags to reassemble the full URL string
    const raw = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, '').trim()
    if (raw.startsWith('http')) cites.push(raw)
  }
  while ((m = titleRe.exec(html)) !== null) titles.push(m[1].replace(/<[^>]+>/g, '').trim())
  while ((m = snippetRe.exec(html)) !== null) snippets.push(m[1].replace(/<[^>]+>/g, '').trim())
  const results: SearchResult[] = []
  for (let i = 0; i < cites.length && results.length < maxResults; i++) {
    let url = cites[i].split('›')[0].trim()
    if (!url.startsWith('http') || SKIP.test(url)) continue
    try { url = new URL(url).origin } catch { continue }
    if (results.some(r => r.url === url)) continue
    results.push({ title: titles[i] ?? '', url, snippet: snippets[i] ?? '' })
  }
  return results
}

async function searchBing(query: string, maxResults = 15, extraParams = ''): Promise<SearchResult[]> {
  const encoded = encodeURIComponent(query)
  const ua = nextUA()
  try {
    const { data } = await axios.get(`https://www.bing.com/search?q=${encoded}&count=30&first=1${extraParams}`, {
      timeout: 15000,
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9,en-US;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.bing.com/',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
      },
    })
    const results = parseBingHtml(typeof data === 'string' ? data : '', maxResults)
    return results
  } catch { return [] }
}

// DuckDuckGo HTML scraper — different rate-limit pool from Bing
async function searchDDG(query: string, maxResults = 15, locale = 'wt-wt'): Promise<SearchResult[]> {
  try {
    const { data } = await axios.post('https://html.duckduckgo.com/html/', `q=${encodeURIComponent(query)}&kl=${locale}`, {
      timeout: 15000,
      maxRedirects: 5,
      headers: {
        'User-Agent': nextUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://duckduckgo.com/',
        'Origin': 'https://duckduckgo.com',
        'Cache-Control': 'no-cache',
      },
    })
    const html: string = typeof data === 'string' ? data : ''
    // DDG result links contain the real URL in a uddg= query param or as href directly
    const results: SearchResult[] = []
    // Method 1: extract from uddg= param in redirect URLs
    const uddgRe = /uddg=([^&"]+)/gi
    let m: RegExpExecArray | null
    const rawUrls: string[] = []
    while ((m = uddgRe.exec(html)) !== null) {
      try { rawUrls.push(decodeURIComponent(m[1])) } catch {}
    }
    // Method 2: result__a links with href
    const hrefRe = /class="result__a"[^>]*href="([^"]+)"/gi
    while ((m = hrefRe.exec(html)) !== null) {
      const href = m[1]
      if (href.startsWith('http') && !href.includes('duckduckgo')) rawUrls.push(href)
    }
    // Extract titles and snippets
    const titleRe = /class="result__a"[^>]*>([\s\S]*?)<\/a>/gi
    const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|span)>/gi
    const titles: string[] = [], snippets: string[] = []
    while ((m = titleRe.exec(html)) !== null) titles.push(m[1].replace(/<[^>]+>/g, '').trim())
    while ((m = snippetRe.exec(html)) !== null) snippets.push(m[1].replace(/<[^>]+>/g, '').trim())

    for (let i = 0; i < rawUrls.length && results.length < maxResults; i++) {
      let url = rawUrls[i]
      if (!url.startsWith('http') || SKIP.test(url)) continue
      try { url = new URL(url).origin } catch { continue }
      if (results.some(r => r.url === url)) continue
      results.push({ title: titles[i] ?? '', url, snippet: snippets[i] ?? '' })
    }
    console.log(`[outreach] DDG found ${results.length} results for: ${query.slice(0, 60)}`)
    return results
  } catch (err: any) {
    console.warn(`[outreach] DDG error: ${err?.message?.slice(0, 60)}`)
    return []
  }
}

// searchEngine: alternates DDG / Bing per call so neither gets hammered
let _searchEngine = 0
async function searchBusinesses(query: string, maxResults = 15, isUK = false): Promise<SearchResult[]> {
  const ddgLocale = isUK ? 'uk-en' : 'wt-wt'
  // Optional paid APIs take priority if configured
  if (process.env.BRAVE_SEARCH_KEY) {
    const r = await searchBrave(query, maxResults)
    if (r.length > 0) return r
  }
  if (process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_ID) {
    const r = await searchGoogle(query, maxResults)
    if (r.length > 0) return r
  }
  // Free built-in engines — alternate DDG and Bing so neither is hammered
  const engine = _searchEngine++ % 2
  if (engine === 0) {
    const r = await searchDDG(query, maxResults, ddgLocale)
    if (r.length > 0) return r
    return searchBing(query, maxResults)
  } else {
    const r = await searchBing(query, maxResults)
    if (r.length > 0) return r
    return searchDDG(query, maxResults, ddgLocale)
  }
}

async function searchBingLocal(query: string, maxResults = 15): Promise<SearchResult[]> {
  return searchBusinesses(query, maxResults)
}

// SMTP verify — ping the mail server to check if address exists (no email sent)
async function smtpVerify(email: string): Promise<boolean> {
  const net = await import('net')
  const domain = email.split('@')[1]
  if (!domain) return false

  let mxHost = ''
  try {
    const records = await dns.resolveMx(domain)
    if (!records.length) return false
    mxHost = records.sort((a, b) => a.priority - b.priority)[0].exchange
  } catch { return false }

  return new Promise(resolve => {
    const socket = net.createConnection(25, mxHost)
    let data = ''
    let stage = 0
    const done = (result: boolean) => { socket.destroy(); resolve(result) }
    const timeout = setTimeout(() => done(false), 8000)

    socket.on('data', chunk => {
      data += chunk.toString()
      if (stage === 0 && data.includes('220')) {
        stage = 1; socket.write(`EHLO forgeai.app\r\n`)
      } else if (stage === 1 && (data.includes('250') || data.includes('220'))) {
        stage = 2; socket.write(`MAIL FROM:<verify@forgeai.app>\r\n`)
      } else if (stage === 2 && data.includes('250')) {
        stage = 3; socket.write(`RCPT TO:<${email}>\r\n`)
      } else if (stage === 3) {
        clearTimeout(timeout)
        // 250/251 = exists, 550/551/553 = no such user
        if (/^2\d\d/m.test(data.split('\n').slice(-2).join('\n'))) done(true)
        else done(false)
      }
    })
    socket.on('error', () => { clearTimeout(timeout); done(false) })
    socket.on('timeout', () => { clearTimeout(timeout); done(false) })
  })
}

function extractPhones(text: string): string[] {
  // UK phone numbers: 11 digits total starting with 0 or +44
  const found = text.match(/(?:\+44\s?\d{10}|0\d{10}|0\d{3}[\s.-]\d{3}[\s.-]\d{4}|0\d{4}[\s.-]\d{6})/g) ?? []
  return [...new Set(found.map(p => p.replace(/[.\-]/g, ' ').replace(/\s+/g, ' ').trim()).filter(p => {
    const digits = p.replace(/\D/g, '')
    return digits.length >= 10 && digits.length <= 13
  }))].slice(0, 3)
}

// ─── Prospect quality scorer (rule-based, no AI cost) ──────────

function scoreProspect(p: Partial<IProspect>): number {
  let s = 10
  if (p.contactEmail) s += 25
  if (p.contactName) s += 15
  if (p.phone) s += 10
  if (p.scrapedSummary && p.scrapedSummary.length > 80) s += 15
  if (p.painPoints && p.painPoints.length > 30) s += 10
  if ((p.scrapedEmails?.length ?? 0) > 1) s += 5
  if (p.website) s += 5
  if (p.generatedEmail) s += 5
  return Math.min(100, s)
}

// ─── AI Research: find REAL businesses via search engine ───────
router.post('/research', upload.single('document'), async (req, res) => {
  try {
  const user = req.user as any
  const { businessDescription, targetIndustry, targetRole, targetLocation, count = 10, campaignName, websiteUrl, socialMode = 'email' } = req.body
  if (!businessDescription?.trim()) return res.status(400).json({ message: 'businessDescription is required' })

  // socialMode: 'email' | 'linkedin' | 'instagram' | 'all'
  const mode: 'email' | 'linkedin' | 'instagram' | 'all' = ['email','linkedin','instagram','all'].includes(socialMode) ? socialMode : 'email'
  const want = Math.min(Number(count) || 10, 50)  // raise cap to 50 for social modes which need more iterations
  const location = (targetLocation || '').trim()
  const role = (targetRole || '').trim()

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`[OUTREACH] NEW RESEARCH REQUEST`)
  console.log(`  Business : ${businessDescription.slice(0, 120)}`)
  console.log(`  Location : ${location || '(any)'}`)
  console.log(`  Wanting  : ${want} prospects`)
  console.log(`${'─'.repeat(60)}`)

  // Detect if UK location to use site:.co.uk restriction (gets individual UK business sites, not directories)
  const isUK = /\b(uk|england|scotland|wales|london|birmingham|manchester|leeds|sheffield|liverpool|bristol|edinburgh|glasgow|cardiff|belfast|nottingham|leicester|coventry|bradford|wolverhampton|derby|reading|southampton|portsmouth|oxford|cambridge|exeter|norwich|hull|sunderland|newcastle|york|bath|brighton|cheltenham|ipswich|worcester|hertford|herts|essex|kent|surrey|sussex|suffolk|norfolk|devon|cornwall|lancashire|yorkshire|midlands)\b/i.test(location)

  // ── STEP 1: Industry Detection ──────────────────────────────
  console.log(`\n[STEP 1] Detecting target industries from business description...`)
  let industries: string[] = []
  const rawIndustry = (targetIndustry || '').trim()
  if (!rawIndustry || rawIndustry.toLowerCase() === 'business') {
    const ai = getAI()
    try {
      const r = await ai.chat([{ role: 'user', content: `You are a global B2B sales expert. Given this business description${location ? ` (targeting customers in: ${location})` : ''}, identify 1-3 SHORT keyword phrases describing the types of BUSINESS CUSTOMERS who would purchase from this business.

IMPORTANT RULES:
- Return ONLY business/organisation types that have their own website and email address
- NEVER return individual consumers (e.g. "homeowner", "individual", "person", "family", "student")
- NEVER return the seller's own industry
- Keep each phrase to 1-2 words maximum — short phrases work better in search engines
- These phrases must work as Google/DuckDuckGo search keywords

Examples:
- "I sell hockey sticks" → ["hockey club", "sports academy", "school sport"]
- "We provide plumbing" → ["property manager", "letting agent", "building contractor"]
- "We do web design" → ["restaurant", "dental clinic", "law firm"]
- "We supply coffee beans" → ["cafe", "coffee shop", "restaurant"]
- "We provide CCTV installation" → ["retail shop", "office building", "hotel"]
- "We sell kitchen equipment" → ["restaurant", "hotel", "catering company"]
- "We make trophies" → ["sports club", "school", "events company"]
- "We offer coding bootcamps" → ["secondary school", "youth centre", "private school"]
- "We supply cleaning products" → ["cleaning company", "hotel", "care home"]
- "We sell office furniture" → ["office", "coworking space", "recruitment agency"]

Return ONLY a JSON array of 1-3 short strings (1-2 words each). No explanation.

Business: ${businessDescription.slice(0, 500)}` }])
      const json = r.content.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const parsed = JSON.parse(json)
      industries = Array.isArray(parsed) ? parsed.map(String).slice(0, 3) : [rawIndustry || 'business']
    } catch {
      industries = [rawIndustry || 'business']
    }
  } else {
    industries = rawIndustry.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean).slice(0, 3)
  }
  console.log(`  → Industries detected: ${industries.map(i => `"${i}"`).join(', ')}`)
  console.log(`  → UK mode: ${isUK}`)

  // ── STEP 2: Build query pool (all iterations draw from this) ──
  // Extract specific city from business description — often more precise than the location field
  const UK_CITY_RE = /\b(birmingham|manchester|london|leeds|sheffield|liverpool|bristol|edinburgh|glasgow|cardiff|nottingham|leicester|coventry|bradford|wolverhampton|derby|reading|southampton|portsmouth|oxford|cambridge|exeter|norwich|hull|sunderland|newcastle|york|bath|brighton|cheltenham|ipswich|worcester|salisbury|gloucester|lincoln|hereford|durham|lancaster|carlisle|chester|stoke|truro|plymouth|swansea|newport|aberdeen|dundee|inverness|perth|stirling|midlands|west midlands|east midlands)\b/gi
  const descCities = [...businessDescription.matchAll(UK_CITY_RE)]
  const searchCity = descCities[0]?.[1]?.toLowerCase() ?? ''
  const hasSpecificCity = !!searchCity
  // When no specific city is known, cycle through major UK cities across rounds
  const UK_FALLBACK_CITIES = ['birmingham', 'manchester', 'london', 'leeds', 'sheffield', 'liverpool', 'bristol', 'nottingham', 'leicester', 'coventry', 'newcastle', 'edinburgh']
  let fallbackCityIdx = 0

  // Build rounds per industry, then interleave so every iteration searches ALL industries.
  // This prevents the MAX_ITERATIONS cap from starving later industries.
  // Drop -site: exclusions from queries — the SKIP regex already blocks these domains,
  // and long exclusion lists cause DDG to return 0 results for multi-word industry phrases.
  const NUM_ROUNDS = 6
  const allIndRounds: string[][][] = []  // [industryIdx][roundIdx][queries]

  for (const ind of industries) {
    // Shorten industry terms longer than 2 words — DDG chokes on 3-word phrases + modifiers
    const words = ind.trim().split(/\s+/)
    const q = words.length > 2 ? words.slice(0, 2).join(' ') : ind

    const rounds: string[][] = []
    if (isUK) {
      const city1 = hasSpecificCity ? searchCity : UK_FALLBACK_CITIES[fallbackCityIdx++ % UK_FALLBACK_CITIES.length]
      const city2 = hasSpecificCity ? searchCity : UK_FALLBACK_CITIES[fallbackCityIdx++ % UK_FALLBACK_CITIES.length]
      const city3 = hasSpecificCity ? searchCity : UK_FALLBACK_CITIES[fallbackCityIdx++ % UK_FALLBACK_CITIES.length]
      const loc = hasSpecificCity ? searchCity : 'uk'

      rounds.push([`${q} ${loc} "contact us"`, `${q} ${loc} "get in touch"`, `${q} ${city1} email contact`, `local ${q} ${loc}`])
      rounds.push([`${q} ${loc} email address`, `${q} ${city1} email`, `${q} ${city2} contact`, `${q} ${city3} email`])
      rounds.push([`${q} ${city1} "get in touch"`, `${q} ${city2} email contact`, `${q} ${loc} enquiries`, `${q} ${city3} "contact us"`])
      rounds.push([`${q} ${city1} enquiries contact`, `${q} ${city2} email address`, `${q} ${loc} "email us"`, `${q} ${city3} phone email`])
      rounds.push([`${q} ${city1} email phone`, `${q} ${loc} contact email phone`, `${q} ${city2} "reach us"`, `${q} ${city3} "get in touch"`])
      rounds.push([`${q} ${loc} email`, `${q} ${city1} contact`, `independent ${q} ${loc}`, `${q} services ${loc}`])
    } else {
      const loc = location || ''
      rounds.push([[q, role, loc, '"contact us"'].filter(Boolean).join(' '), [q, loc, '"get in touch"'].filter(Boolean).join(' '), [q, loc, 'email contact'].filter(Boolean).join(' '), [`local ${q}`, loc].filter(Boolean).join(' ')])
      rounds.push([[q, loc, 'email address'].filter(Boolean).join(' '), [q, loc, 'email'].filter(Boolean).join(' '), [q, loc, 'contact'].filter(Boolean).join(' '), [`${q} services`, loc].filter(Boolean).join(' ')])
      rounds.push([[`${q} company`, loc, 'email'].filter(Boolean).join(' '), [q, loc, '"email us"'].filter(Boolean).join(' '), [q, loc, 'enquiries'].filter(Boolean).join(' '), [`${q} ltd`, loc].filter(Boolean).join(' ')])
      rounds.push([[q, loc, 'contact email phone'].filter(Boolean).join(' '), [`${q} centre`, loc].filter(Boolean).join(' '), [q, loc, 'email phone website'].filter(Boolean).join(' '), [q, loc, '"get in touch" OR "contact us"'].filter(Boolean).join(' ')])
      rounds.push([[`${q} owner`, loc, 'email'].filter(Boolean).join(' '), [`${q} manager`, loc, 'contact'].filter(Boolean).join(' '), [`independent ${q}`, loc].filter(Boolean).join(' '), [`local ${q}`, loc, 'email enquiries'].filter(Boolean).join(' ')])
      rounds.push([[q, loc, 'email enquiry'].filter(Boolean).join(' '), [`small ${q}`, loc].filter(Boolean).join(' '), [`${q} near`, loc].filter(Boolean).join(' '), [`${q} directory`, loc, 'email'].filter(Boolean).join(' ')])
    }
    allIndRounds.push(rounds)
  }

  // Transpose: merge one round from each industry into each pool entry
  // so every iteration covers all 3 industries, not just one
  const queryPool: string[][] = []
  for (let r = 0; r < NUM_ROUNDS; r++) {
    const merged: string[] = []
    for (const indRounds of allIndRounds) {
      if (indRounds[r]) merged.push(...indRounds[r])
    }
    if (merged.length) queryPool.push(merged)
  }

  const queriesPerBatch = Math.max(...queryPool.map(b => b.length))
  console.log(`  Query pool: ${queryPool.length} rounds × up to ${queriesPerBatch} queries = up to ${queryPool.reduce((s, b) => s + b.length, 0)} total searches`)
  if (isUK) {
    if (hasSpecificCity) console.log(`  → City extracted from description: "${searchCity}"`)
    else console.log(`  → No specific city found — cycling through: ${UK_FALLBACK_CITIES.slice(0, 6).join(', ')}...`)
  } else if (location) {
    console.log(`  → Location: "${location}"`)
  } else {
    console.log(`  → No location specified — searching globally`)
  }

  // ── Optional: extra context ─────────────────────────────────
  let extraContext = ''
  if (websiteUrl?.trim()) {
    try {
      const { data } = await axios.get(websiteUrl.trim(), { timeout: 8000, headers: FETCH_HEADERS })
      extraContext = stripHtml(typeof data === 'string' ? data : '').slice(0, 2000)
    } catch {}
  }
  if (req.file) {
    extraContext += '\n' + extractDocumentText(req.file.buffer, req.file.mimetype, req.file.originalname).slice(0, 2000)
  }

  // ── Shared constants ────────────────────────────────────────
  // Only the paths most likely to expose a real contact email — no privacy/legal/terms pages
  // (those only ever have privacy@ or legal@ addresses that we reject anyway)
  const CONTACT_PATHS = [
    '/contact', '/contact-us', '/get-in-touch',
    '/about', '/about-us', '/team', '/our-team', '/staff',
  ]
  const PLATFORM_SKIP = /game|play|casino|arcade|saas|platform|software|\.io$|cdn\.|cloud\.|analytics\.|tracking\.|wiki\.|blog\.|news\.|press\.|forum\.|ecommerce/i
  const normaliseUrl = (u: string) => /^https?:\/\//i.test(u) ? u : `https://${u}`

  const scrapedUrls = new Set<string>()  // tracks all URLs tried across all iterations
  const finalDocs: any[] = []
  let totalScraped = 0
  let totalWithEmail = 0
  const HARD_CAP = 40          // absolute max iterations to prevent infinite loops
  const MAX_NO_PROGRESS = 4    // stop if this many consecutive iterations yield nothing new
  let totalIterations = 0      // actual iterations run (reported in logs)

  // ── Scrape helper (shared across iterations) ────────────────
  async function scrapeUrl(result: { title: string; url: string; snippet: string }) {
    // Normalize http→https to deduplicate protocol variants of the same site
    const base = result.url.replace(/\/$/, '').replace(/^http:\/\//, 'https://')
    if (scrapedUrls.has(base)) return null
    scrapedUrls.add(base)
    try {
      const homeHtml = await fetchPage(base)
      if (!homeHtml) { console.log(`  ✗ UNREACHABLE  ${base}`); return null }
      // Fetch contact pages in small sequential batches to avoid 25+ concurrent requests crashing the process
      const extraPages: string[] = []
      for (let ci = 0; ci < CONTACT_PATHS.length; ci += 3) {
        const batch = CONTACT_PATHS.slice(ci, ci + 3)
        const results = await Promise.all(batch.map(p => fetchPage(`${base}${p}`)))
        extraPages.push(...results)
        if (ci + 3 < CONTACT_PATHS.length) await new Promise(r => setTimeout(r, 300))
      }
      // Cap each page at 80KB before joining to prevent multi-MB regex on combined HTML
      const CAP = 80_000
      const allHtml = [homeHtml, ...extraPages].filter(Boolean).map(h => h.slice(0, CAP)).join('\n')
      const mailtoEmails = extractMailtoEmails(allHtml)
      const cfEmails = extractCloudflareMails(allHtml)
      const ldEmails = extractJsonLdEmails(allHtml)
      const regexEmails = extractEmails(stripHtml(allHtml))
      const rawEmails = [...new Set([...mailtoEmails, ...cfEmails, ...ldEmails, ...regexEmails])].filter(e => {
        const d = e.split('@')[1] ?? ''
        return !SERVICE_DOMAINS.has(d) && !PLACEHOLDER_DOMAINS.has(d)
      })
      const domain = new URL(base).hostname.replace(/^www\./, '')
      const phones = extractPhones(stripHtml(allHtml).slice(0, 8000))
      const text = stripHtml(homeHtml)

      // Extract social profile URLs from all scraped HTML (footer/about/contact links)
      const liMatches = allHtml.match(/https?:\/\/(www\.)?linkedin\.com\/(company|in)\/[a-zA-Z0-9_%-]+\/?/g) ?? []
      const linkedinUrl = liMatches.find(u => !/linkedin\.com\/(company|in)\/(linkedin|company|login|signup|home|feed)\b/.test(u)) ?? ''
      const igRaw = allHtml.match(/https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9_.]+\/?/g) ?? []
      const instagramUrl = igRaw.find(u => !/(instagram\.com\/(p\/|reel\/|explore\/|tv\/|stories\/|accounts\/|#|instagram))/.test(u)) ?? ''

      if (rawEmails.length > 0) {
        const src = [mailtoEmails.length ? `mailto:${mailtoEmails.length}` : '', cfEmails.length ? `CF:${cfEmails.length}` : '', ldEmails.length ? `LD:${ldEmails.length}` : '', regexEmails.length ? `regex:${regexEmails.length}` : ''].filter(Boolean).join(', ')
        console.log(`  ✓ HAS EMAIL    ${base}`)
        console.log(`      emails : ${rawEmails.slice(0, 3).join(', ')} (via ${src})`)
        if (phones.length) console.log(`      phones : ${phones.join(', ')}`)
      } else {
        console.log(`  ~ NO EMAIL     ${base}`)
      }
      if (linkedinUrl) console.log(`      linkedin: ${linkedinUrl}`)
      if (instagramUrl) console.log(`      instagram: ${instagramUrl}`)
      return { url: base, domain, text, emails: rawEmails, phones, linkedinUrl, instagramUrl, title: result.title, snippet: result.snippet }
    } catch { return null }
  }

  // ── AI select helper ────────────────────────────────────────
  async function aiSelectProspects(pool: any[], need: number): Promise<any[]> {
    if (!pool.length) return []
    const poolSize = Math.min(pool.length, Math.max(need * 6, 20))
    const summaries = pool.slice(0, poolSize).map((s, i) =>
      `[${i}] URL: ${s.url}\nPageText: ${s.text.slice(0, 300)}\nEmails: ${s.emails.slice(0, 3).join(', ')}\nLinkedIn: ${s.linkedinUrl || 'none'}\nInstagram: ${s.instagramUrl || 'none'}\nPhones: ${s.phones.slice(0, 1).join(', ') || 'none'}`
    ).join('\n\n---\n\n')

    const channelNote = mode === 'linkedin' ? 'Prioritize sites with a LinkedIn profile URL.'
      : mode === 'instagram' ? 'Prioritize sites with an Instagram profile URL.'
      : mode === 'all' ? 'Sites may have email, LinkedIn, Instagram, or any combination.'
      : 'Prioritize sites with email addresses.'

    const prompt = `You are given ${poolSize} real scraped business websites. Select exactly ${need} best prospects for this outreach. ${channelNote}

MY BUSINESS: ${businessDescription}
TARGET INDUSTRIES: ${industries.join(', ')}
${location ? `TARGET LOCATION: ${location}` : ''}
${extraContext ? `CONTEXT: ${extraContext.slice(0, 400)}` : ''}

SCRAPED SITES:
${summaries}

Return a JSON array where each item has: index, companyName, contactName, location, painPoints.
Rules:
- companyName: extract the ACTUAL organisation name from PageText (e.g. "Birmingham Hockey Club"), NOT the URL or a generic label
- SKIP sites with no plausible connection to MY BUSINESS
- SKIP directories, platforms, news sites, governing bodies, national chains
- Try to return exactly ${need} items; return fewer only if the whole pool is irrelevant
- Respond ONLY with a valid JSON array, no markdown, no explanation.`

    try {
      const ai = getAI()
      const r = await ai.chat([{ role: 'user', content: prompt }])
      const raw = r.content.replace(/```json\n?/g, '').replace(/```\n?/g, '')
      const match = raw.match(/\[[\s\S]*\]/)
      if (!match) throw new Error('no JSON array')
      return JSON.parse(match[0])
    } catch {
      // Fallback: rule-based pick
      return pool
        .filter(s => !PLATFORM_SKIP.test(s.domain))
        .slice(0, need)
        .map((s, i) => ({ index: pool.indexOf(s), companyName: s.title.replace(/ [-|›|·].*/, '').trim() || s.domain, contactName: '', location, painPoints: s.snippet || '' }))
    }
  }

  // ── MAIN LOOP ───────────────────────────────────────────────
  // Runs until the target is reached. Cycles the pre-built query pool with variations;
  // stops early if HARD_CAP is hit or MAX_NO_PROGRESS consecutive iterations yield nothing.
  const CYCLE_SUFFIXES = ['', 'email enquiries', '"contact us" email', 'get in touch contact email', 'telephone email staff']
  let noProgressStreak = 0
  for (let iter = 0; finalDocs.length < want && iter < HARD_CAP; iter++) {
    totalIterations = iter + 1
    const need = want - finalDocs.length
    const poolIdx = iter % queryPool.length
    const cycleNum = Math.floor(iter / queryPool.length)
    const suffix = CYCLE_SUFFIXES[Math.min(cycleNum, CYCLE_SUFFIXES.length - 1)]
    const iterQueries = (queryPool[poolIdx] ?? []).map(q => suffix ? `${q} ${suffix}` : q)
    const cycleLabel = cycleNum > 0 ? ` (cycle ${cycleNum + 1}, suffix: "${suffix}")` : ''
    console.log(`\n${'─'.repeat(55)}`)
    console.log(`[ITERATION ${iter + 1}] Need ${need} more prospect(s)${cycleLabel}`)
    console.log(`  Queries: ${iterQueries.map(q => `"${q}"`).join(' | ')}`)

    // Stagger requests — avoid rate-limiting both Bing and DDG
    if (iter > 0) await new Promise(r => setTimeout(r, 2000))

    // Search sequentially with a gap between each query
    const batches: { title: string; url: string; snippet: string }[][] = []
    for (const q of iterQueries) {
      batches.push(await searchBusinesses(q, 20, isUK))
      await new Promise(r => setTimeout(r, 1500))
    }
    const allBatch = batches.flat()
    // TLD filter: in UK mode drop foreign ccTLDs; in non-UK mode (with a specific location) drop .co.uk/.org.uk
    const ukFiltered = isUK
      ? allBatch.filter(r => {
          try {
            const host = new URL(r.url).hostname.replace(/^www\./, '')
            return !(/\.(fr|de|es|it|nl|be|pl|pt|ru|jp|cn|au|nz|ca|za|br|mx|ar|in|pk|bd|ng|gh|ke|tz|ug|rw)$/.test(host))
          } catch { return true }
        })
      : location
        ? allBatch.filter(r => {
            try {
              const host = new URL(r.url).hostname.replace(/^www\./, '')
              return !(/\.(co\.uk|org\.uk|ac\.uk|me\.uk|net\.uk|ltd\.uk|plc\.uk)$/.test(host))
            } catch { return true }
          })
        : allBatch
    const newResults = ukFiltered.filter(r => !scrapedUrls.has(r.url.replace(/\/$/, '').replace(/^http:\/\//, 'https://')))
    console.log(`  → ${batches.flat().length} raw URLs, ${newResults.length} not yet scraped`)
    if (!newResults.length) {
      noProgressStreak++
      console.log(`  (no new URLs — skipping) [no-progress streak: ${noProgressStreak}/${MAX_NO_PROGRESS}]`)
      if (noProgressStreak >= MAX_NO_PROGRESS) { console.log('  (too many empty rounds — stopping early)') ; break }
      continue
    }

    // Scrape sites sequentially (one at a time) to prevent concurrent-connection overload
    // Cap at 15: enough to yield 10 prospects (typically 30-50% have emails) without OOM or timeout
    const toScrape = newResults.slice(0, Math.min(need * 2 + 5, 15))
    console.log(`  Scraping ${toScrape.length} sites (${CONTACT_PATHS.length + 1} pages each)...`)
    const scraped: any[] = []
    for (const result of toScrape) {
      const s = await scrapeUrl(result)
      if (s) scraped.push(s)
      await new Promise(r => setTimeout(r, 400))
    }
    // Filter by mode: what counts as a usable prospect
    const SPORT_IND_RE = /hockey|football|cricket|rugby|netball|tennis|golf|swim|gym|sport|athletic|basketball|volleyball|badminton|squash|cycling|running|martial|boxing|wrestling/i
    const needsSportFilter = industries.some(i => SPORT_IND_RE.test(i))
    const SPORT_SIGNAL = /hockey|sport|club|academy|school|college|athletic|leisure|recreation|hc\b|fc\b|gym|pitch|arena|ground|coaching|junior|youth|fitness/i
    const passesMode = (s: any) => {
      if (mode === 'email') return s.emails.length > 0
      if (mode === 'linkedin') return !!s.linkedinUrl
      if (mode === 'instagram') return !!s.instagramUrl
      return s.emails.length > 0 || !!s.linkedinUrl || !!s.instagramUrl  // 'all'
    }
    const allWithContact = scraped.filter(passesMode)
    const withEmail = needsSportFilter
      ? allWithContact.filter(s => SPORT_SIGNAL.test(s.domain) || SPORT_SIGNAL.test(s.text.slice(0, 600)))
      : allWithContact
    totalScraped += scraped.length
    totalWithEmail += withEmail.length
    const dropped = allWithContact.length - withEmail.length
    console.log(`  Scraped ${scraped.length} reachable, ${allWithContact.length} have contact (mode=${mode}), ${withEmail.length} pass filter${dropped ? ` (${dropped} dropped)` : ''}`)
    if (!withEmail.length) {
      noProgressStreak++
      if (noProgressStreak >= MAX_NO_PROGRESS) { console.log('  (too many empty rounds — stopping early)') ; break }
      continue
    }
    noProgressStreak = 0  // found emails — reset streak

    // AI select
    const selected = await aiSelectProspects(withEmail, need)
    console.log(`  AI selected ${selected.length} prospect(s)`)
    selected.forEach((p: any, i: number) => console.log(`    [${i + 1}] ${p.companyName}`))

    // Build docs — deduplicate by domain across all iterations
    const usedEmails = new Set(finalDocs.map(d => d.contactEmail).filter(Boolean))
    const usedDomains = new Set(finalDocs.map(d => { try { return new URL(d.website ?? '').hostname.replace(/^www\./, '') } catch { return '' } }))
    const usedLinkedIn = new Set(finalDocs.map(d => (d as any).linkedinUrl).filter(Boolean))
    const usedInstagram = new Set(finalDocs.map(d => (d as any).instagramUrl).filter(Boolean))
    for (const p of selected) {
      if (finalDocs.length >= want) break
      const site = withEmail[p.index]
      if (!site) continue
      const emails: string[] = site.emails ?? []
      // In email mode require an email; in social modes a social URL is enough
      if (mode === 'email' && !emails.length) continue
      if (mode === 'linkedin' && !site.linkedinUrl) continue
      if (mode === 'instagram' && !site.instagramUrl) continue
      if (mode === 'all' && !emails.length && !site.linkedinUrl && !site.instagramUrl) continue
      const personal = emails.find((e: string) => !ROLE_LOCALS.has(e.split('@')[0]))
      const contactEmail = personal ?? emails[0] ?? ''
      // Skip if we already have this exact email or domain or social handle
      if (contactEmail && usedEmails.has(contactEmail)) { console.log(`    (skip duplicate email: ${contactEmail})`); continue }
      if (site.linkedinUrl && usedLinkedIn.has(site.linkedinUrl)) { console.log(`    (skip duplicate linkedin: ${site.linkedinUrl})`); continue }
      if (site.instagramUrl && usedInstagram.has(site.instagramUrl)) { console.log(`    (skip duplicate instagram: ${site.instagramUrl})`); continue }
      if (usedDomains.has(site.domain)) { console.log(`    (skip duplicate domain: ${site.domain})`); continue }
      if (contactEmail) usedEmails.add(contactEmail)
      if (site.linkedinUrl) usedLinkedIn.add(site.linkedinUrl)
      if (site.instagramUrl) usedInstagram.add(site.instagramUrl)
      usedDomains.add(site.domain)
      // Sanitise AI-returned company name: reject generic page-title phrases and separator-polluted titles
      const GENERIC_NAMES = /^(contact\s*us?|get\s*in\s*touch|home|about\s*us?|welcome|index|untitled|page\s*not\s*found|properties\s*for\s*(sale|rent)|houses\s*for\s*(sale|rent)|flats\s*for\s*(sale|rent)|search\s*results?|listings?|find\s*(a\s*)?property|contact|enquir|reach\s*us)$/i
      // Decode HTML entities in AI response (e.g. &amp; → &, &amp;amp; → &)
      let companyName = (p.companyName || '').trim()
        .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
      // If AI returned a separator-joined title like "Contact Us :: West Bromwich HC", take the longest segment
      if (/[|:›·]/.test(companyName)) {
        const parts = companyName.split(/\s*[|:›·]+\s*/).map((s: string) => s.trim()).filter(Boolean)
        companyName = parts.sort((a: string, b: string) => b.length - a.length)[0] ?? companyName
      }
      // If still generic, fall back to domain-derived name
      if (!companyName || GENERIC_NAMES.test(companyName)) {
        companyName = site.domain.replace(/\.(co\.uk|org\.uk|com|net|org)$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      }
      finalDocs.push({
        userId: user._id,
        companyName: companyName || site.domain || 'Unknown',
        website: normaliseUrl(site.url),
        contactName: p.contactName || '',
        contactEmail: contactEmail || undefined,
        scrapedEmails: emails.slice(0, 6),
        phone: site.phones[0] || '',
        linkedinUrl: site.linkedinUrl || undefined,
        instagramUrl: site.instagramUrl || undefined,
        industry: industries[0] || rawIndustry || '',
        location: p.location || location,
        painPoints: p.painPoints || site.snippet || '',
        campaignName: campaignName?.trim() || undefined,
        status: 'researched' as const,
        scrapedAt: new Date(),
      })
    }
    console.log(`  Running total: ${finalDocs.length}/${want}`)
  }

  if (!finalDocs.length) {
    const channelName = mode === 'linkedin' ? 'LinkedIn profile' : mode === 'instagram' ? 'Instagram profile' : 'public email'
    const msg = totalScraped === 0
      ? `No websites found for "${industries.join(', ')}"${location ? ` in "${location}"` : ''}. Try different search terms.`
      : `Scraped ${totalScraped} sites across ${totalIterations} search rounds but none had a ${channelName} for "${industries.join(', ')}". Try a more specific location or industry.`
    return res.status(404).json({ message: msg, scrapedTotal: totalScraped, withEmail: totalWithEmail })
  }

  const created = await Prospect.insertMany(finalDocs)
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`[DONE] Created ${created.length}/${want} prospects across ${totalIterations} iteration(s) [mode=${mode}]`)
  created.forEach((p: any, i: number) => {
    console.log(`  [${i + 1}] ${p.companyName}`)
    console.log(`        email   : ${p.contactEmail || '—'}`)
    console.log(`        linkedin: ${p.linkedinUrl || '—'}`)
    console.log(`        instagram:${p.instagramUrl || '—'}`)
    console.log(`        website : ${p.website}`)
    console.log(`        location: ${p.location || '—'}`)
  })
  console.log(`${'─'.repeat(60)}\n`)
  if (!res.headersSent) res.json({ created: created.length, prospects: created, scrapedTotal: totalScraped, withEmail: totalWithEmail })
  } catch (err: any) {
    console.error('[outreach] Research route error:', err?.message ?? err)
    if (!res.headersSent) res.status(500).json({ message: err?.message ?? 'Research failed unexpectedly' })
  }
})

// ─── Scrape helpers ────────────────────────────────────────────

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
}

async function fetchPage(url: string): Promise<string> {
  try {
    const { data } = await axios.get(url, { timeout: 10000, maxRedirects: 5, headers: FETCH_HEADERS })
    return typeof data === 'string' ? data : ''
  } catch {
    if (url.startsWith('https://')) {
      try {
        const { data } = await axios.get(url.replace('https://', 'http://'), { timeout: 8000, maxRedirects: 5, headers: FETCH_HEADERS })
        return typeof data === 'string' ? data : ''
      } catch { return '' }
    }
    return ''
  }
}

// Extract emails from JSON-LD / schema.org markup — Wix/WP/Squarespace auto-generate this
// even when no email is visible on the page itself
function extractJsonLdEmails(html: string): string[] {
  const results: string[] = []
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let sm: RegExpExecArray | null
  while ((sm = scriptRe.exec(html)) !== null) {
    try {
      const obj = JSON.parse(sm[1])
      const walk = (node: any) => {
        if (!node || typeof node !== 'object') return
        for (const key of Object.keys(node)) {
          if (key.toLowerCase() === 'email' && typeof node[key] === 'string') {
            const e = node[key].toLowerCase().trim().replace(/^mailto:/i, '')
            if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) results.push(e)
          } else if (Array.isArray(node[key])) {
            node[key].forEach(walk)
          } else if (typeof node[key] === 'object') {
            walk(node[key])
          }
        }
      }
      walk(obj)
    } catch {}
  }
  return [...new Set(results)]
}

// Decode Cloudflare-protected emails (data-cfemail hex attribute)
// Cloudflare XORs the email bytes with the first byte as the key — browser decodes on load
function extractCloudflareMails(html: string): string[] {
  const results: string[] = []
  const re = /data-cfemail="([0-9a-f]+)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      const hex = m[1]
      const key = parseInt(hex.slice(0, 2), 16)
      let decoded = ''
      for (let i = 2; i < hex.length; i += 2) {
        decoded += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key)
      }
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(decoded)) results.push(decoded.toLowerCase())
    } catch {}
  }
  return [...new Set(results)]
}

// Pull mailto: href values — most reliable source of real email addresses
function extractMailtoEmails(html: string): string[] {
  const found: string[] = []
  const re = /href=["']mailto:([^"'?#\s]+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const e = m[1].toLowerCase().trim()
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) found.push(e)
  }
  return [...new Set(found)]
}

// Parse sitemap.xml / robots.txt to find real contact/about/team page URLs
async function discoverContactUrls(base: string): Promise<string[]> {
  const urls: string[] = []
  const CONTACT_KEYWORDS = /contact|about|team|people|staff|reach|touch|directory|enquir|meet/i

  // Try robots.txt for Sitemap: pointer
  const robotsHtml = await fetchPage(`${base}/robots.txt`)
  const sitemapUrls = (robotsHtml.match(/Sitemap:\s*(\S+)/gi) ?? [])
    .map(l => l.replace(/Sitemap:\s*/i, '').trim())

  // Also try common sitemap locations
  sitemapUrls.push(`${base}/sitemap.xml`, `${base}/sitemap_index.xml`, `${base}/sitemap-pages.xml`)

  for (const smUrl of sitemapUrls.slice(0, 4)) {
    const xml = await fetchPage(smUrl)
    if (!xml) continue
    const locs = xml.match(/<loc>(.*?)<\/loc>/gi) ?? []
    for (const loc of locs) {
      const u = loc.replace(/<\/?loc>/gi, '').trim()
      if (CONTACT_KEYWORDS.test(u)) urls.push(u)
    }
    if (urls.length >= 8) break
  }

  return [...new Set(urls)].slice(0, 8)
}

// ─── Scrape: multi-page, mailto-first, no AI for email finding ─
router.post('/scrape', async (req, res) => {
  const user = req.user as any
  const { url: rawUrl, prospectId } = req.body
  if (!rawUrl?.trim()) return res.status(400).json({ message: 'url is required' })

  const base = /^https?:\/\//i.test(rawUrl.trim())
    ? rawUrl.trim().replace(/\/$/, '')
    : `https://${rawUrl.trim().replace(/\/$/, '')}`

  // 1. Homepage
  const homeHtml = await fetchPage(base)
  if (!homeHtml) return res.status(422).json({ message: `Could not fetch ${base} — site may be down or blocking bots.` })

  // 2. Discover real contact pages via sitemap + common paths (all in parallel)
  const COMMON_PATHS = [
    '/contact', '/contact-us', '/contact_us', '/contactus',
    '/about', '/about-us', '/about_us',
    '/team', '/our-team', '/meet-the-team', '/staff', '/people',
    '/reach-us', '/get-in-touch', '/enquiry', '/enquiries',
    '/info', '/help',
  ]

  const [sitemapUrls, ...commonHtmls] = await Promise.all([
    discoverContactUrls(base),
    ...COMMON_PATHS.map(p => fetchPage(`${base}${p}`)),
  ])

  // 3. Fetch sitemap-discovered contact pages
  const sitemapHtmls = await Promise.all(sitemapUrls.map(u => fetchPage(u)))

  const allHtml = [homeHtml, ...commonHtmls, ...sitemapHtmls].join('\n')

  // 4. Extract emails — mailto: links first (most reliable), then regex fallback
  const mailtoEmails = extractMailtoEmails(allHtml)
  const regexEmails = extractEmails(allHtml)
  // deduplicate, mailto results first
  const rawEmails = [...new Set([...mailtoEmails, ...regexEmails])]

  // 5. MX-validate and score — only one AI call for summary, no AI for emails
  const [scoredEmails, aiResult] = await Promise.all([
    scoreAndValidateEmails(rawEmails),
    (async () => {
      if (!homeHtml) return { summary: '', companyName: '' }
      const text = stripHtml(homeHtml)
      // Single compact AI call: both summary and name in one prompt
      const ai = getAI()
      const prompt = `From this website content respond with a JSON object with two keys:
- "name": company name (short string)
- "summary": 2-3 sentence company summary focusing on what they do and who they serve

CONTENT: ${text.slice(0, 3000)}

Respond with ONLY the JSON object.`
      try {
        const r = await ai.chat([{ role: 'user', content: prompt }])
        const j = JSON.parse(r.content.trim().replace(/```json\n?/g, '').replace(/```\n?/g, ''))
        return { summary: j.summary ?? '', companyName: j.name ?? '' }
      } catch { return { summary: '', companyName: '' } }
    })(),
  ])

  const { summary, companyName } = aiResult
  const emails = scoredEmails.map(e => e.email)

  if (prospectId) {
    const prospect = await Prospect.findOne({ _id: prospectId, userId: user._id })
    if (prospect) {
      prospect.scrapedSummary = summary
      prospect.scrapedEmails = emails
      if (companyName && prospect.companyName === 'Unknown') prospect.companyName = companyName
      const bestEmail = scoredEmails.find(e => e.quality === 'personal')?.email ?? emails[0]
      if (bestEmail && !prospect.contactEmail) prospect.contactEmail = bestEmail
      prospect.scrapedAt = new Date()
      prospect.status = 'researched'
      await prospect.save()
    }
  }

  res.json({ emails: scoredEmails, summary, companyName })
})

// ─── Generate cold email for one prospect ─────────────────────
router.post('/generate-email', async (req, res) => {
  const user = req.user as any
  const {
    prospectId, businessDescription, tone = 'professional', customInstructions,
    senderName, senderTitle, senderBusinessName, senderWebsite, senderPhone,
  } = req.body
  if (!prospectId || !businessDescription) {
    return res.status(400).json({ message: 'prospectId and businessDescription are required' })
  }

  const prospect = await Prospect.findOne({ _id: prospectId, userId: user._id })
  if (!prospect) return res.status(404).json({ message: 'Prospect not found' })

  const toneGuide: Record<string, string> = {
    professional: 'formal, respectful, business-focused',
    friendly: 'warm, conversational, approachable',
    bold: 'direct, confident, punchy — short sentences, no fluff',
    concise: 'extremely brief, under 100 words, only the essential value prop',
  }

  // Build signature block from only the fields the user provided
  const sigLines: string[] = []
  if (senderName?.trim()) sigLines.push(senderName.trim())
  if (senderTitle?.trim()) sigLines.push(senderTitle.trim())
  if (senderBusinessName?.trim()) sigLines.push(senderBusinessName.trim())
  if (senderWebsite?.trim()) sigLines.push(senderWebsite.trim())
  if (senderPhone?.trim()) sigLines.push(senderPhone.trim())
  const signatureBlock = sigLines.length
    ? `SENDER SIGNATURE (use exactly as-is at the end of the email):\n${sigLines.join('\n')}`
    : 'SENDER SIGNATURE: (none provided — end with a simple sign-off like "Best,")'

  const ai = getAI()
  const prompt = `Write a cold outreach email from my business to this prospect.

MY BUSINESS: ${businessDescription}

PROSPECT:
- Company: ${prospect.companyName}
- Contact: ${prospect.contactName ?? 'the team'}
- Industry: ${prospect.industry ?? 'unknown'}
- Website summary: ${prospect.scrapedSummary ?? prospect.painPoints ?? 'N/A'}
- Pain points: ${prospect.painPoints ?? 'N/A'}

TONE: ${toneGuide[tone] ?? toneGuide.professional}
${customInstructions ? `EXTRA INSTRUCTIONS: ${customInstructions}` : ''}

${signatureBlock}

Write a subject line and email body. The email must:
1. Open with something specific about their business (not generic)
2. Connect their pain point to what I offer
3. Have a clear, low-friction CTA (short call, quick reply)
4. Feel human, not like a template
5. NEVER use placeholder text like [Your Name], [Business Name], [Your Website], [Phone], etc.
   Use only the real values provided above. If a value was not provided, leave it out entirely.

Format your response EXACTLY as:
SUBJECT: [subject line here]
BODY:
[email body here]`

  try {
    const r = await ai.chat([{ role: 'user', content: prompt }])
    const text = r.content.trim()
    const subjectMatch = text.match(/^SUBJECT:\s*(.+)/m)
    const bodyMatch = text.match(/BODY:\n([\s\S]+)/)
    const subject = subjectMatch?.[1]?.trim() ?? 'Following up'
    const body = bodyMatch?.[1]?.trim() ?? text

    prospect.generatedSubject = subject
    prospect.generatedEmail = body
    prospect.emailTone = tone as EmailTone
    prospect.emailGeneratedAt = new Date()
    prospect.status = 'ready'
    await prospect.save()

    res.json({ subject, body, prospect })
  } catch (err: any) {
    res.status(500).json({ message: 'Email generation failed', detail: err?.message })
  }
})

// ─── Send single email via Gmail ──────────────────────────────
router.post('/send-gmail', async (req, res) => {
  const user = req.user as any
  const { to, subject, body, prospectId } = req.body
  if (!to || !subject || !body) return res.status(400).json({ message: 'to, subject, and body are required' })

  const dbUser = await User.findById(user._id).select('+gmailRefreshToken')
  if (!dbUser?.gmailRefreshToken || !dbUser?.gmailEmail) {
    return res.status(400).json({ message: 'Gmail not connected — go to Settings to connect your Gmail account' })
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI,
  )
  oauth2Client.setCredentials({ refresh_token: dbUser.gmailRefreshToken })
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

  const rawMessage = [
    `From: ${dbUser.gmailEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n')

  try {
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: Buffer.from(rawMessage).toString('base64url') },
    })
  } catch (err: any) {
    return res.status(502).json({ message: `Gmail send failed: ${err?.message}` })
  }

  let prospect = null
  if (prospectId) {
    prospect = await Prospect.findOne({ _id: prospectId, userId: user._id })
    if (prospect) {
      prospect.status = 'sent'
      prospect.sentAt = new Date()
      prospect.lastContactedAt = new Date()
      prospect.score = scoreProspect(prospect)
      prospect.activities.push({ type: 'email', body: `Email sent to ${to}`, createdAt: new Date() })
      await prospect.save()
    }
  }

  res.json({ sent: true, prospect })
})

// ─── Bulk generate emails ──────────────────────────────────────
router.post('/generate-bulk', async (req, res) => {
  const user = req.user as any
  const { prospectIds, businessDescription, tone = 'professional', senderName, senderTitle, senderBusinessName, senderWebsite, senderPhone } = req.body
  if (!Array.isArray(prospectIds) || !businessDescription) {
    return res.status(400).json({ message: 'prospectIds[] and businessDescription are required' })
  }

  const sigLines: string[] = []
  if (senderName?.trim()) sigLines.push(senderName.trim())
  if (senderTitle?.trim()) sigLines.push(senderTitle.trim())
  if (senderBusinessName?.trim()) sigLines.push(senderBusinessName.trim())
  if (senderWebsite?.trim()) sigLines.push(senderWebsite.trim())
  if (senderPhone?.trim()) sigLines.push(senderPhone.trim())
  const signatureBlock = sigLines.length ? sigLines.join('\n') : ''

  const results: { id: string; ok: boolean; error?: string }[] = []

  for (const prospectId of prospectIds) {
    try {
      const prospect = await Prospect.findOne({ _id: prospectId, userId: user._id })
      if (!prospect) { results.push({ id: prospectId, ok: false, error: 'Not found' }); continue }

      const ai = getAI()
      const prompt = `Write a cold outreach email. MY BUSINESS: ${businessDescription}
PROSPECT: ${prospect.companyName}, ${prospect.industry ?? ''}, ${prospect.scrapedSummary ?? prospect.painPoints ?? ''}
TONE: ${tone}
${signatureBlock ? `SENDER SIGNATURE (use exactly):\n${signatureBlock}` : 'No signature provided — end simply.'}
IMPORTANT: Never use placeholder text like [Your Name] or [Business Name]. Use the real values above or omit.
Format: SUBJECT: [line]\nBODY:\n[body]`

      const r = await ai.chat([{ role: 'user', content: prompt }])
      const text = r.content.trim()
      const subjectMatch = text.match(/^SUBJECT:\s*(.+)/m)
      const bodyMatch = text.match(/BODY:\n([\s\S]+)/)

      prospect.generatedSubject = subjectMatch?.[1]?.trim() ?? 'Quick question'
      prospect.generatedEmail = bodyMatch?.[1]?.trim() ?? text
      prospect.emailTone = tone as EmailTone
      prospect.emailGeneratedAt = new Date()
      prospect.status = 'ready'
      await prospect.save()

      results.push({ id: prospectId, ok: true })
    } catch (err: any) {
      results.push({ id: prospectId, ok: false, error: err?.message })
    }
  }

  res.json({ results, generated: results.filter(r => r.ok).length })
})

// ─── Import CSV ────────────────────────────────────────────────
router.post('/import', upload.single('file'), async (req, res) => {
  const user = req.user as any
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' })

  const csv = req.file.buffer.toString('utf-8')
  const lines = csv.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return res.status(400).json({ message: 'CSV must have a header row and at least one data row' })

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ''))
  const col = (row: string[], name: string) => {
    const idx = headers.findIndex(h => h.includes(name))
    return idx >= 0 ? row[idx]?.trim() : undefined
  }

  const toCreate: any[] = []
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i])
    const company = col(row, 'company') ?? col(row, 'name') ?? col(row, 'business')
    if (!company) continue
    toCreate.push({
      userId: user._id,
      companyName: company,
      website: col(row, 'website') ?? col(row, 'url') ?? col(row, 'domain'),
      contactName: col(row, 'contact') ?? col(row, 'firstname') ?? col(row, 'person'),
      contactEmail: col(row, 'email'),
      industry: col(row, 'industry') ?? col(row, 'niche'),
      location: col(row, 'location') ?? col(row, 'city') ?? col(row, 'country'),
      campaignName: col(row, 'campaign'),
      notes: col(row, 'notes') ?? col(row, 'note'),
      status: 'new',
    })
  }

  if (!toCreate.length) return res.status(400).json({ message: 'No valid rows found — check column headers' })
  const created = await Prospect.insertMany(toCreate)
  res.json({ imported: created.length })
})

// ─── Export CSV ────────────────────────────────────────────────
router.get('/export', async (req, res) => {
  const user = req.user as any
  const { status, campaignName } = req.query
  const filter: any = { userId: user._id }
  if (status) filter.status = status
  if (campaignName) filter.campaignName = campaignName

  const prospects = await Prospect.find(filter).sort({ createdAt: -1 }).limit(10000)
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = [
    ['Company', 'Website', 'Contact Name', 'Contact Email', 'Industry', 'Location', 'Status', 'Campaign', 'Email Subject', 'Generated Email', 'Pain Points', 'Notes', 'Scraped Summary', 'Created'].map(esc).join(','),
    ...prospects.map(p => [
      p.companyName, p.website, p.contactName, p.contactEmail,
      p.industry, p.location, p.status, p.campaignName,
      p.generatedSubject, p.generatedEmail, p.painPoints, p.notes,
      p.scrapedSummary, new Date(p.createdAt).toISOString(),
    ].map(esc).join(',')),
  ]

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="prospects.csv"')
  res.send(rows.join('\n'))
})

// ─── Stats ─────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  const user = req.user as any
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const [total, thisWeek, byStatus, campaigns] = await Promise.all([
    Prospect.countDocuments({ userId: user._id }),
    Prospect.countDocuments({ userId: user._id, createdAt: { $gte: weekAgo } }),
    Prospect.aggregate([{ $match: { userId: user._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Prospect.distinct('campaignName', { userId: user._id, campaignName: { $ne: null } }),
  ])
  const statusMap: Record<string, number> = {}
  byStatus.forEach((s: any) => { if (s._id) statusMap[s._id] = s.count })
  res.json({ total, thisWeek, byStatus: statusMap, campaigns })
})

// ─── Campaign analytics ────────────────────────────────────────
router.get('/analytics', async (req, res) => {
  const user = req.user as any
  const uid = user._id

  const [total, byStatusRaw, campaignRaw, weeklyRaw, industryRaw, scoreRaw] = await Promise.all([
    Prospect.countDocuments({ userId: uid }),
    Prospect.aggregate([{ $match: { userId: uid } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Prospect.aggregate([
      { $match: { userId: uid, campaignName: { $ne: null, $exists: true } } },
      {
        $group: {
          _id: '$campaignName',
          total: { $sum: 1 },
          sent: { $sum: { $cond: [{ $in: ['$status', ['sent', 'replied', 'converted', 'lost']] }, 1, 0] } },
          replied: { $sum: { $cond: [{ $in: ['$status', ['replied', 'converted']] }, 1, 0] } },
          converted: { $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] } },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 20 },
    ]),
    Prospect.aggregate([
      { $match: { userId: uid, createdAt: { $gte: new Date(Date.now() - 56 * 24 * 3600 * 1000) } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%U', date: '$createdAt' } },
          count: { $sum: 1 },
          sent: { $sum: { $cond: [{ $in: ['$status', ['sent', 'replied', 'converted']] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Prospect.aggregate([
      { $match: { userId: uid, industry: { $ne: null, $exists: true } } },
      { $group: { _id: '$industry', count: { $sum: 1 }, converted: { $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] } } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
    Prospect.aggregate([{ $match: { userId: uid } }, { $group: { _id: null, avg: { $avg: '$score' } } }]),
  ])

  const statusMap: Record<string, number> = {}
  byStatusRaw.forEach((s: any) => { if (s._id) statusMap[s._id] = s.count })
  const sent = (statusMap.sent ?? 0) + (statusMap.replied ?? 0) + (statusMap.converted ?? 0) + (statusMap.lost ?? 0)
  const replied = (statusMap.replied ?? 0) + (statusMap.converted ?? 0)
  const converted = statusMap.converted ?? 0

  const byCampaign = campaignRaw.map((c: any) => ({
    name: c._id,
    total: c.total,
    sent: c.sent,
    replied: c.replied,
    converted: c.converted,
    replyRate: c.sent > 0 ? Math.round((c.replied / c.sent) * 100) : 0,
  }))

  res.json({
    total,
    byStatus: statusMap,
    sent,
    replied,
    converted,
    replyRate: sent > 0 ? Math.round((replied / sent) * 100) : 0,
    conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0,
    avgScore: Math.round(scoreRaw[0]?.avg ?? 0),
    byCampaign,
    byWeek: weeklyRaw.map((w: any) => ({ week: w._id, count: w.count, sent: w.sent })),
    byIndustry: industryRaw.map((i: any) => ({ industry: i._id, count: i.count, converted: i.converted })),
  })
})

// ─── Follow-ups due today/tomorrow ─────────────────────────────
router.get('/follow-ups', async (req, res) => {
  const user = req.user as any
  const tomorrow = new Date(Date.now() + 48 * 3600 * 1000)
  const prospects = await Prospect.find({
    userId: user._id,
    followUpAt: { $lte: tomorrow },
    status: { $nin: ['converted', 'lost'] },
  }).sort({ followUpAt: 1 }).limit(20)
  res.json({ prospects })
})

// ─── Template library ──────────────────────────────────────────
router.get('/templates', async (req, res) => {
  const user = req.user as any
  const templates = await OutreachTemplate.find({ userId: user._id }).sort({ createdAt: -1 }).limit(100)
  res.json({ templates })
})

router.post('/templates', async (req, res) => {
  const user = req.user as any
  const { name, subject, body, tone, industry } = req.body
  if (!name?.trim() || !subject?.trim() || !body?.trim()) {
    return res.status(400).json({ message: 'name, subject, and body are required' })
  }
  const template = await OutreachTemplate.create({ userId: user._id, name: name.trim(), subject: subject.trim(), body: body.trim(), tone, industry })
  res.json({ template })
})

router.delete('/templates/:tid', async (req, res) => {
  const user = req.user as any
  const deleted = await OutreachTemplate.findOneAndDelete({ _id: req.params.tid, userId: user._id })
  if (!deleted) return res.status(404).json({ message: 'Not found' })
  res.json({ deleted: true })
})

// Mark a template used (increments counter and stamps lastUsedAt)
router.post('/templates/:tid/use', async (req, res) => {
  const user = req.user as any
  await OutreachTemplate.findOneAndUpdate(
    { _id: req.params.tid, userId: user._id },
    { $inc: { timesUsed: 1 }, lastUsedAt: new Date() },
  )
  res.json({ ok: true })
})

// ─── Bulk score all prospects ───────────────────────────────────
router.post('/bulk-score', async (req, res) => {
  const user = req.user as any
  const prospects = await Prospect.find({ userId: user._id })
  const bulk = prospects.map(p => ({
    updateOne: {
      filter: { _id: p._id },
      update: { score: scoreProspect(p) },
    },
  }))
  if (bulk.length) await Prospect.bulkWrite(bulk)
  res.json({ scored: bulk.length })
})

// ─── Bulk send via Gmail ────────────────────────────────────────
router.post('/bulk-send', async (req, res) => {
  const user = req.user as any
  const { ids } = req.body
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'ids[] required' })

  const dbUser = await User.findById(user._id).select('+gmailRefreshToken')
  if (!dbUser?.gmailRefreshToken || !dbUser?.gmailEmail) {
    return res.status(400).json({ message: 'Gmail not connected — go to Settings to connect Gmail' })
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI,
  )
  oauth2Client.setCredentials({ refresh_token: dbUser.gmailRefreshToken })
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

  const results: { id: string; ok: boolean; error?: string }[] = []
  for (const id of ids) {
    try {
      const prospect = await Prospect.findOne({ _id: id, userId: user._id })
      if (!prospect) { results.push({ id, ok: false, error: 'Not found' }); continue }
      if (!prospect.contactEmail) { results.push({ id, ok: false, error: 'No contact email' }); continue }
      if (!prospect.generatedEmail) { results.push({ id, ok: false, error: 'No generated email' }); continue }

      const subject = prospect.generatedSubject ?? 'Quick question'
      const body = prospect.generatedEmail
      const rawMessage = [
        `From: ${dbUser.gmailEmail}`,
        `To: ${prospect.contactEmail}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        '',
        body,
      ].join('\r\n')

      await gmail.users.messages.send({ userId: 'me', requestBody: { raw: Buffer.from(rawMessage).toString('base64url') } })
      prospect.status = 'sent'
      prospect.sentAt = new Date()
      prospect.lastContactedAt = new Date()
      prospect.score = scoreProspect(prospect)
      prospect.activities.push({ type: 'email', body: `Email sent to ${prospect.contactEmail}`, createdAt: new Date() })
      await prospect.save()
      results.push({ id, ok: true })
    } catch (err: any) {
      results.push({ id, ok: false, error: err?.message })
    }
  }

  res.json({ results, sent: results.filter(r => r.ok).length })
})

// ─── Social media research: Instagram / LinkedIn ───────────────
router.post('/social-research', async (req, res) => {
  const user = req.user as any
  const { platform, handle, url: inputUrl, prospectId } = req.body
  if (!platform || (!handle && !inputUrl)) {
    return res.status(400).json({ message: 'platform and handle (or url) are required' })
  }

  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
  }

  let pageUrl = inputUrl?.trim() ?? ''
  let rawHtml = ''
  let info: Record<string, string> = {}

  if (platform === 'instagram') {
    if (!pageUrl) pageUrl = `https://www.instagram.com/${handle.replace('@', '')}/`
    try {
      const { data } = await axios.get(pageUrl, { timeout: 12000, headers: HEADERS })
      rawHtml = typeof data === 'string' ? data : ''

      // Extract from og: meta tags (most reliable without login)
      const ogTitle = rawHtml.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1] ?? ''
      const ogDesc = rawHtml.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)?.[1] ?? ''
      const canonical = rawHtml.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)?.[1] ?? pageUrl

      // og:description on Instagram: "X Followers, Y Following, Z Posts — …bio…"
      const bioMatch = ogDesc.match(/Posts?\s*[–—-]\s*(.+)$/i)
      info = {
        platform: 'instagram',
        profileUrl: canonical,
        displayName: ogTitle.replace(/\s*•\s*Instagram.*$/i, '').trim(),
        bio: bioMatch?.[1]?.trim() ?? ogDesc,
        website: '',
      }

      // Try to find linked website in page source
      const websiteMatch = rawHtml.match(/"external_url"\s*:\s*"([^"]+)"/)
        ?? rawHtml.match(/class="[^"]*lynx_text[^"]*"[^>]*>.*?href="([^"]+)"/i)
      if (websiteMatch?.[1]) info.website = websiteMatch[1]

    } catch (err: any) {
      return res.status(422).json({ message: `Could not fetch Instagram profile: ${err?.message}` })
    }

  } else if (platform === 'linkedin') {
    if (!pageUrl) pageUrl = `https://www.linkedin.com/company/${handle}/`
    try {
      const { data } = await axios.get(pageUrl, { timeout: 12000, headers: HEADERS })
      rawHtml = typeof data === 'string' ? data : ''

      const ogTitle = rawHtml.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1] ?? ''
      const ogDesc = rawHtml.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)?.[1] ?? ''
      const industry = rawHtml.match(/<dd[^>]*class="[^"]*industry[^"]*"[^>]*>([^<]+)/i)?.[1]?.trim()
        ?? rawHtml.match(/"industry"\s*:\s*"([^"]+)"/)?.[1] ?? ''
      const website = rawHtml.match(/"companyPageUrl"\s*:\s*"([^"]+)"/)?.[1]
        ?? rawHtml.match(/rel="noopener noreferrer nofollow"[^>]*href="([^"]+)"/)?.[1] ?? ''

      info = {
        platform: 'linkedin',
        profileUrl: pageUrl,
        displayName: ogTitle.replace(/\s*\|\s*LinkedIn$/i, '').trim(),
        description: ogDesc,
        industry,
        website,
      }
    } catch (err: any) {
      return res.status(422).json({ message: `Could not fetch LinkedIn page: ${err?.message}` })
    }
  } else {
    return res.status(400).json({ message: 'platform must be "instagram" or "linkedin"' })
  }

  // Extract emails from scraped HTML and validate
  const rawEmails = extractEmails(rawHtml)
  const scoredEmails = rawEmails.length ? await scoreAndValidateEmails(rawEmails) : []

  // AI summarize for pain points + outreach context
  let summary = ''
  if (rawHtml) {
    const ai = getAI()
    const text = stripHtml(rawHtml)
    try {
      const r = await ai.chat([{
        role: 'user',
        content: `Based on this ${platform} profile, write 2-3 sentences about what this business does and potential pain points relevant for a sales outreach:\n\n${JSON.stringify(info)}\n\n${text.slice(0, 2000)}`,
      }])
      summary = r.content.trim()
    } catch { /* summary stays empty */ }
  }

  // Update existing prospect or return raw data
  if (prospectId) {
    const prospect = await Prospect.findOne({ _id: prospectId, userId: user._id })
    if (prospect) {
      if (info.displayName && prospect.companyName === 'Unknown') prospect.companyName = info.displayName
      if (info.website && !prospect.website) prospect.website = info.website
      if (summary && !prospect.scrapedSummary) prospect.scrapedSummary = summary
      if (scoredEmails.length) {
        prospect.scrapedEmails = [...new Set([...prospect.scrapedEmails, ...scoredEmails.map(e => e.email)])]
        const best = scoredEmails.find(e => e.quality === 'personal')?.email ?? scoredEmails[0]?.email
        if (best && !prospect.contactEmail) prospect.contactEmail = best
      }
      if (info.industry && !prospect.industry) prospect.industry = info.industry
      prospect.status = 'researched'
      prospect.scrapedAt = new Date()
      await prospect.save()
    }
  }

  res.json({ info, emails: scoredEmails, summary })
})

// ─── List prospects ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  const user = req.user as any
  const { status, campaignName, search, location, limit = 50, skip = 0 } = req.query
  const filter: any = { userId: user._id }
  if (status) filter.status = status
  if (campaignName) filter.campaignName = campaignName
  if (location) filter.location = new RegExp(String(location), 'i')
  if (search) {
    const re = new RegExp(String(search), 'i')
    filter.$or = [{ companyName: re }, { contactEmail: re }, { contactName: re }, { industry: re }, { location: re }]
  }

  const [prospects, total] = await Promise.all([
    Prospect.find(filter).sort({ createdAt: -1 }).skip(Number(skip)).limit(Number(limit)),
    Prospect.countDocuments(filter),
  ])
  res.json({ prospects, total })
})

// ─── Bulk status update ────────────────────────────────────────
router.patch('/bulk-status', async (req, res) => {
  const user = req.user as any
  const { ids, status } = req.body
  if (!Array.isArray(ids) || !status) return res.status(400).json({ message: 'ids[] and status required' })
  await Prospect.updateMany({ _id: { $in: ids }, userId: user._id }, { status })
  res.json({ updated: ids.length })
})

// ─── Bulk delete ───────────────────────────────────────────────
router.delete('/bulk', async (req, res) => {
  const user = req.user as any
  const { ids } = req.body
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'ids[] required' })
  const result = await Prospect.deleteMany({ _id: { $in: ids }, userId: user._id })
  res.json({ deleted: result.deletedCount })
})

// ─── Generate multi-channel outreach sequence ───────────────────
router.post('/:id/generate-sequence', async (req, res) => {
  const user = req.user as any
  const { businessDescription, contactName, linkedinHandle, instagramHandle } = req.body

  const prospect = await Prospect.findOne({ _id: req.params.id, userId: user._id })
  if (!prospect) return res.status(404).json({ message: 'Not found' })

  const context = [
    `Company: ${prospect.companyName}`,
    prospect.industry && `Industry: ${prospect.industry}`,
    prospect.location && `Location: ${prospect.location}`,
    prospect.contactName && `Contact: ${prospect.contactName}`,
    prospect.scrapedSummary && `About: ${prospect.scrapedSummary.slice(0, 300)}`,
    prospect.painPoints && `Pain points: ${prospect.painPoints.slice(0, 200)}`,
    businessDescription && `My business: ${businessDescription}`,
  ].filter(Boolean).join('\n')

  const nameToUse = contactName?.trim() || prospect.contactName?.trim() || 'there'
  const liHandle = linkedinHandle?.trim() || ''
  const igHandle = instagramHandle?.trim() || ''

  const ai = getAI()
  const hasPhone = !!(prospect.phone?.trim())
  const waStep = hasPhone
    ? `- Day 2: WhatsApp message (warm intro, conversational tone, ≤ 160 chars — feels like a personal text, not a sales pitch)`
    : ''

  const r = await ai.chat([{
    role: 'user',
    content: `Generate a ${hasPhone ? '7' : '6'}-step multi-channel cold outreach sequence for this prospect. Return ONLY a valid JSON array, no markdown, no explanation.

Each step must have exactly these fields:
{
  "day": number,
  "platform": "linkedin" | "instagram" | "email" | "whatsapp",
  "action": "connect" | "message" | "comment" | "dm" | "email" | "follow_up" | "whatsapp",
  "message": "the actual message text — personalised, no placeholders like [Name]",
  "subject": "email subject line (only if platform is email, omit otherwise)"
}

Sequence structure:
- Day 1: LinkedIn connection request (≤ 300 chars, personal, reference something specific about them)
${waStep}
- Day 3: Instagram comment (casual, value-adding comment they'd want to reply to, ≤ 150 chars)
- Day 5: LinkedIn message (reference the connection, short, curious hook)
- Day 7: Email (value-focused, 3 short paragraphs, include subject)
- Day 10: Instagram DM (warm, reference the comment from Day 3)
- Day 14: LinkedIn final follow-up (brief, low-pressure close)

Context:
${context}

Their first name: ${nameToUse}
Rules: Never use [brackets]. Sound human. Each message must stand alone.`,
  }])

  let steps: any[] = []
  try {
    const json = r.content.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    steps = JSON.parse(json)
    if (!Array.isArray(steps)) throw new Error('not array')
  } catch {
    return res.status(422).json({ message: 'AI returned unexpected format — try again' })
  }

  prospect.sequence = steps.slice(0, 8).map((s: any) => ({
    day: Number(s.day) || 1,
    platform: s.platform ?? 'linkedin',
    action: s.action ?? 'message',
    message: String(s.message ?? ''),
    subject: s.subject ? String(s.subject) : undefined,
    status: 'pending' as const,
  }))

  // Save profile handles if provided
  if (liHandle && !prospect.linkedinUrl) prospect.linkedinUrl = liHandle.startsWith('http') ? liHandle : `https://www.linkedin.com/in/${liHandle}`
  if (igHandle) {
    const igUrl = igHandle.startsWith('http') ? igHandle : `https://www.instagram.com/${igHandle.replace('@', '')}/`
    if (!prospect.linkedinUrl?.includes('instagram')) (prospect as any).instagramUrl = igUrl
  }

  await prospect.save()
  res.json({ sequence: prospect.sequence })
})

// ─── Enable / disable WhatsApp auto-send for a prospect's sequence ───
router.post('/:id/autosend', async (req, res) => {
  const user = req.user as any
  const { enable } = req.body
  const prospect = await Prospect.findOne({ _id: req.params.id, userId: user._id })
  if (!prospect) return res.status(404).json({ message: 'Not found' })
  if (!prospect.phone) return res.status(400).json({ message: 'Prospect has no phone number — add one first' })
  if (!prospect.sequence.length) return res.status(400).json({ message: 'Generate a sequence first' })

  // Check user has WA credentials
  const fullUser = await User.findById(user._id).select('+settings.waAccessToken settings.waPhoneNumberId').lean() as any
  if (!fullUser?.settings?.waAccessToken) {
    return res.status(400).json({ message: 'WhatsApp credentials not configured — go to Settings first' })
  }

  if (enable) {
    prospect.sequenceStartedAt = new Date()
    // Reset all pending WA steps so scheduler can fire them
    prospect.sequence.forEach(s => { if (s.platform === 'whatsapp' && s.status !== 'done') s.status = 'pending' })
  } else {
    (prospect as any).sequenceStartedAt = undefined
  }

  await prospect.save()
  res.json({ autoSendEnabled: enable, sequenceStartedAt: prospect.sequenceStartedAt })
})

// ─── Update a single sequence step (mark done / edit message) ───
router.patch('/:id/sequence/:stepIdx', async (req, res) => {
  const user = req.user as any
  const idx = Number(req.params.stepIdx)
  const { status, message, subject } = req.body

  const prospect = await Prospect.findOne({ _id: req.params.id, userId: user._id })
  if (!prospect) return res.status(404).json({ message: 'Not found' })
  if (!prospect.sequence[idx]) return res.status(404).json({ message: 'Step not found' })

  if (status !== undefined) {
    prospect.sequence[idx].status = status
    if (status === 'done') {
      prospect.sequence[idx].doneAt = new Date()
      // Auto-log activity
      const step = prospect.sequence[idx]
      prospect.activities.push({
        type: step.platform === 'linkedin' ? 'linkedin' : step.platform === 'instagram' ? 'instagram' : 'email',
        body: `${step.platform} ${step.action} sent (Day ${step.day})`,
        createdAt: new Date(),
      })
    }
  }
  if (message !== undefined) prospect.sequence[idx].message = message
  if (subject !== undefined) prospect.sequence[idx].subject = subject

  prospect.markModified('sequence')
  prospect.markModified('activities')
  await prospect.save()
  res.json({ sequence: prospect.sequence, activities: prospect.activities })
})

// ─── Webhook dispatch (send step to Zapier/Make/n8n) ───────────
router.post('/:id/sequence/:stepIdx/dispatch', async (req, res) => {
  const user = req.user as any
  const idx = Number(req.params.stepIdx)
  const { webhookUrl } = req.body

  if (!webhookUrl?.startsWith('http')) return res.status(400).json({ message: 'webhookUrl is required' })

  const prospect = await Prospect.findOne({ _id: req.params.id, userId: user._id })
  if (!prospect) return res.status(404).json({ message: 'Not found' })
  const step = prospect.sequence[idx]
  if (!step) return res.status(404).json({ message: 'Step not found' })

  const payload = {
    prospectId: prospect._id,
    companyName: prospect.companyName,
    contactName: prospect.contactName,
    contactEmail: prospect.contactEmail,
    website: prospect.website,
    linkedinUrl: prospect.linkedinUrl,
    platform: step.platform,
    action: step.action,
    day: step.day,
    message: step.message,
    subject: step.subject,
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    })
    res.json({ dispatched: true })
  } catch (err: any) {
    res.status(502).json({ message: `Webhook failed: ${err?.message}` })
  }
})

// ─── Add activity to prospect ───────────────────────────────────
router.post('/:id/activity', async (req, res) => {
  const user = req.user as any
  const { type, body } = req.body
  if (!type || !body?.trim()) return res.status(400).json({ message: 'type and body required' })

  const prospect = await Prospect.findOneAndUpdate(
    { _id: req.params.id, userId: user._id },
    { $push: { activities: { type, body: body.trim(), createdAt: new Date() } } },
    { new: true },
  )
  if (!prospect) return res.status(404).json({ message: 'Not found' })
  res.json({ activities: prospect.activities })
})

// ─── AI hyper-personalized opener ──────────────────────────────
router.post('/:id/personalize', async (req, res) => {
  const user = req.user as any
  const prospect = await Prospect.findOne({ _id: req.params.id, userId: user._id })
  if (!prospect) return res.status(404).json({ message: 'Not found' })

  const context = [
    prospect.companyName,
    prospect.industry,
    prospect.scrapedSummary?.slice(0, 400),
    prospect.painPoints?.slice(0, 200),
  ].filter(Boolean).join(' | ')

  const ai = getAI()
  const r = await ai.chat([{
    role: 'user',
    content: `Write a single hyper-personalized opening sentence for a cold email to this company. It should show you specifically researched them — not generic. One sentence only, no greeting word like "Hi", no ellipsis, no placeholder brackets.\n\nCompany context: ${context}`,
  }])
  const opener = r.content.trim().replace(/^["']|["']$/g, '')

  prospect.personalizedOpener = opener
  await prospect.save()
  res.json({ personalizedOpener: opener })
})

// ─── Generate A/B email variants ───────────────────────────────
router.post('/:id/variants', async (req, res) => {
  const user = req.user as any
  const { businessDescription } = req.body
  const prospect = await Prospect.findOne({ _id: req.params.id, userId: user._id })
  if (!prospect) return res.status(404).json({ message: 'Not found' })
  if (!businessDescription && !prospect.generatedEmail) {
    return res.status(400).json({ message: 'businessDescription is required for first-time generation' })
  }

  const ctx = `Company: ${prospect.companyName}. ${prospect.industry ?? ''} ${prospect.location ?? ''}. ${(prospect.scrapedSummary ?? prospect.painPoints ?? '').slice(0, 300)}`
  const base = businessDescription ?? 'Our service'

  const ai = getAI()
  const r = await ai.chat([{
    role: 'user',
    content: `Generate 3 A/B test email variants for cold outreach. Each variant uses a DIFFERENT angle. Return ONLY valid JSON array with no markdown:\n[\n  {"label":"Pain Point","subject":"...", "body":"...", "tone":"professional"},\n  {"label":"Results","subject":"...","body":"...","tone":"bold"},\n  {"label":"Question","subject":"...","body":"...","tone":"friendly"}\n]\n\nMY BUSINESS: ${base}\nPROSPECT: ${ctx}\n\nRules: No placeholders like [Name]. Keep each body under 120 words. No signature line.`,
  }])

  let variants: any[] = []
  try {
    const json = r.content.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    variants = JSON.parse(json)
    if (!Array.isArray(variants)) throw new Error('not array')
  } catch {
    return res.status(422).json({ message: 'AI returned unexpected format — try again' })
  }

  prospect.variants = variants.slice(0, 3).map((v: any) => ({
    label: String(v.label ?? 'Variant'),
    subject: String(v.subject ?? ''),
    body: String(v.body ?? ''),
    tone: String(v.tone ?? 'professional'),
  }))
  await prospect.save()
  res.json({ variants: prospect.variants })
})

// ─── Update single prospect ────────────────────────────────────
router.patch('/:id', async (req, res) => {
  const user = req.user as any
  const allowed = [
    'status', 'notes', 'contactEmail', 'contactName', 'companyName', 'website',
    'generatedEmail', 'generatedSubject', 'campaignName', 'sentAt', 'repliedAt',
    'tags', 'followUpAt', 'followUpNote', 'linkedinUrl', 'instagramUrl', 'personalizedOpener',
    'lastContactedAt', 'emailTone',
  ]
  const update: any = {}
  for (const key of allowed) { if (req.body[key] !== undefined) update[key] = req.body[key] }

  // Auto-log status change activity
  const ops: any = { $set: update }
  if (update.status) {
    const prev = await Prospect.findOne({ _id: req.params.id, userId: user._id }, 'status')
    if (prev && prev.status !== update.status) {
      ops.$push = { activities: { type: 'status_change', body: `Status changed from ${prev.status} → ${update.status}`, createdAt: new Date() } }
    }
    if (['sent', 'replied'].includes(update.status)) {
      update.lastContactedAt = new Date()
    }
  }

  const prospect = await Prospect.findOneAndUpdate(
    { _id: req.params.id, userId: user._id },
    ops,
    { new: true },
  )
  if (!prospect) return res.status(404).json({ message: 'Not found' })

  // Re-score after save
  prospect.score = scoreProspect(prospect)
  await prospect.save()
  res.json({ prospect })
})

// ─── Delete single ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const user = req.user as any
  const deleted = await Prospect.findOneAndDelete({ _id: req.params.id, userId: user._id })
  if (!deleted) return res.status(404).json({ message: 'Not found' })
  res.json({ deleted: true })
})

// ─── WhatsApp Agent ──────────────────────────────────────────────
// Accepts a plain-English instruction, runs the full pipeline:
// parse → research → create prospects → generate WA sequence → enable autosend
// Streams progress back as Server-Sent Events so the UI updates in real time.
router.post('/wa-agent', async (req, res) => {
  const user = req.user as any

  // SSE setup
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const emit = (type: string, payload: Record<string, any> = {}) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`)
  }

  try {
    const { instruction, businessDescription } = req.body
    if (!instruction?.trim()) { emit('error', { message: 'instruction is required' }); return res.end() }

    // Check WA credentials
    const fullUser = await User.findById(user._id).select('+settings.waAccessToken settings.waPhoneNumberId settings.waDisplayPhone settings.waVerifiedName').lean() as any
    const waToken: string = fullUser?.settings?.waAccessToken ?? process.env.WA_ACCESS_TOKEN ?? ''
    const waPhoneId: string = fullUser?.settings?.waPhoneNumberId ?? process.env.WA_PHONE_NUMBER_ID ?? ''
    if (!waToken || !waPhoneId) {
      emit('error', { message: 'WhatsApp not configured. Go to Settings → WhatsApp Business API and paste your credentials first.' })
      return res.end()
    }

    emit('step', { icon: '🤖', message: 'Understanding your request…' })

    // Step 1: AI parses the instruction into structured params
    const ai = getAI()
    const parseResp = await ai.chat([{ role: 'user', content: `Extract outreach parameters from this instruction. Return ONLY valid JSON, no explanation.

Instruction: "${instruction}"

JSON format:
{
  "targetIndustry": "1-2 word phrase describing who to contact",
  "location": "city or country (empty string if not mentioned)",
  "count": <number of prospects, default 10, max 20>,
  "messageTheme": "what the WhatsApp message should be about (inferred from context)"
}` }])

    let params = { targetIndustry: '', location: '', count: 10, messageTheme: '' }
    try {
      const match = parseResp.content.match(/\{[\s\S]*\}/)
      if (match) params = { ...params, ...JSON.parse(match[0]) }
    } catch { /* use defaults */ }

    const biz = (businessDescription || instruction).slice(0, 500)
    const loc = params.location || ''
    const want = Math.min(Math.max(Number(params.count) || 10, 1), 20)
    const industry = params.targetIndustry || 'business'

    emit('step', { icon: '🔍', message: `Searching for "${industry}"${loc ? ` in ${loc}` : ''}… (target: ${want} prospects)` })

    // Step 2: Build queries and search
    const queries = loc
      ? [`${industry} ${loc} contact email phone`, `${industry} ${loc} "contact us"`, `${industry} ${loc} enquiries`]
      : [`${industry} contact email phone`, `${industry} "contact us"`, `${industry} enquiries`]

    const allResults: SearchResult[] = []
    for (const q of queries) {
      const r = await searchBusinesses(q, 15)
      allResults.push(...r)
      await new Promise(r => setTimeout(r, 1200))
    }
    // Deduplicate by URL
    const seen = new Set<string>()
    const unique = allResults.filter(r => {
      const key = r.url.replace(/^http:\/\//, 'https://').replace(/\/$/, '')
      if (seen.has(key)) return false
      seen.add(key)
      return !SKIP.test(r.url)
    })

    emit('step', { icon: '🌐', message: `Found ${unique.length} websites — scraping for phone numbers…` })

    // Step 3: Scrape for phone numbers (agent specifically needs phone for WA)
    const scrapedUrls = new Set<string>()
    const scraped: any[] = []
    for (const result of unique.slice(0, 25)) {
      const base = result.url.replace(/\/$/, '').replace(/^http:\/\//, 'https://')
      if (scrapedUrls.has(base)) continue
      scrapedUrls.add(base)
      try {
        const homeHtml = await fetchPage(base)
        if (!homeHtml) continue
        const CAP = 80_000
        const contactHtml = await fetchPage(`${base}/contact`).catch(() => '')
        const allHtml = [homeHtml, contactHtml].filter(Boolean).map(h => h.slice(0, CAP)).join('\n')
        const phones = extractPhones(stripHtml(allHtml).slice(0, 8000))
        const emails = [...new Set([...extractMailtoEmails(allHtml), ...extractEmails(stripHtml(allHtml))])].filter(e => {
          const d = e.split('@')[1] ?? ''; return !SERVICE_DOMAINS.has(d) && !PLACEHOLDER_DOMAINS.has(d)
        })
        const liMatches = allHtml.match(/https?:\/\/(www\.)?linkedin\.com\/(company|in)\/[a-zA-Z0-9_%-]+\/?/g) ?? []
        const linkedinUrl = liMatches.find(u => !/linkedin\.com\/(company|in)\/(linkedin|login|signup)\b/.test(u)) ?? ''
        const domain = new URL(base).hostname.replace(/^www\./, '')
        const text = stripHtml(homeHtml).slice(0, 600)
        if (phones.length || emails.length) {
          scraped.push({ url: base, domain, text, phones, emails, linkedinUrl, title: result.title, snippet: result.snippet })
        }
      } catch { /* skip */ }
      await new Promise(r => setTimeout(r, 300))
    }

    const withPhone = scraped.filter(s => s.phones.length > 0)
    emit('step', { icon: '📞', message: `${withPhone.length} sites have phone numbers — creating prospects…` })

    if (!withPhone.length) {
      emit('error', { message: `No phone numbers found for "${industry}"${loc ? ` in ${loc}` : ''}. Try a more specific search or a different location.` })
      return res.end()
    }

    // Step 4: AI selects best prospects
    const pool = withPhone.slice(0, Math.max(want * 3, 15))
    const summaries = pool.map((s, i) => `[${i}] ${s.domain}\nAbout: ${s.text.slice(0, 200)}\nPhone: ${s.phones[0]}`).join('\n---\n')
    const selectResp = await ai.chat([{ role: 'user', content: `Select the best ${want} prospects from this list for WhatsApp outreach.
MY BUSINESS: ${biz}
LOOKING FOR: ${industry}${loc ? ' in ' + loc : ''}

${summaries}

Return ONLY a JSON array of objects: [{ "index": number, "companyName": string, "contactName": string }]` }])

    let selected: any[] = []
    try {
      const match = selectResp.content.match(/\[[\s\S]*\]/)
      if (match) selected = JSON.parse(match[0])
    } catch { selected = pool.slice(0, want).map((s, i) => ({ index: i, companyName: s.domain, contactName: '' })) }

    // Step 5: Create prospects + generate WA sequence + enable autosend
    const created: any[] = []
    for (const pick of selected.slice(0, want)) {
      if (res.writableEnded) break
      const site = pool[pick.index]
      if (!site) continue
      emit('step', { icon: '✉️', message: `Setting up ${pick.companyName || site.domain}…` })
      try {
        // Generate a short WhatsApp-specific message via AI
        const msgResp = await ai.chat([{ role: 'user', content: `Write a WhatsApp cold outreach message for this prospect. Max 160 characters. Sound human and personal, not like a template. No placeholders.

My business: ${biz}
Message theme: ${params.messageTheme || 'intro and value offer'}
Prospect: ${pick.companyName || site.domain}
About them: ${site.text.slice(0, 200)}` }])
        const waMsg = msgResp.content.trim().slice(0, 400)

        // Save prospect
        const prospect = await Prospect.create({
          userId: user._id,
          companyName: pick.companyName || site.domain,
          website: site.url,
          contactName: pick.contactName || '',
          contactEmail: site.emails[0] || undefined,
          scrapedEmails: site.emails.slice(0, 4),
          phone: site.phones[0],
          linkedinUrl: site.linkedinUrl || undefined,
          industry: industry,
          location: loc || undefined,
          painPoints: site.snippet || '',
          sequence: [{
            day: 1,
            platform: 'whatsapp',
            action: 'whatsapp',
            message: waMsg,
            status: 'pending',
          }],
          sequenceStartedAt: new Date(),  // auto-send enabled immediately
          status: 'researched',
          scrapedAt: new Date(),
        })
        created.push(prospect)
      } catch { /* skip this one */ }
      await new Promise(r => setTimeout(r, 200))
    }

    emit('done', {
      icon: '✅',
      message: `Done! ${created.length} prospect${created.length !== 1 ? 's' : ''} created with WhatsApp sequences active. First messages will send within the hour.`,
      count: created.length,
      prospects: created.map(p => ({ _id: p._id, companyName: p.companyName, phone: p.phone, website: p.website })),
    })
  } catch (err: any) {
    emit('error', { message: err?.message ?? 'Agent failed unexpectedly' })
  } finally {
    res.end()
  }
})

export default router
