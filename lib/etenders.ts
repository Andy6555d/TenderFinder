import * as cheerio from 'cheerio'
import { ETENDERS_DETAIL_BASE, ETENDERS_SEARCH_URL } from '@/lib/constants'
import { createAdminClient } from '@/lib/supabase/admin'
import { classifySupplyOnly, scoreTender } from '@/lib/relevance'
import type { TaxonomyRule } from '@/lib/types'

const LABELS = [
  'Workarea:', 'Name of Contracting Authority:', 'Publish on behalf of:', 'Participating bodies:', 'Title:',
  'CfT CA Unique ID:', 'Evaluation Mechanism:', 'Description:', 'Procurement Type:', 'CPC Category:', 'Directive:',
  'Procedure:', 'CfT Involves:', 'Framework agreement Timeframe:', 'CPV Codes:', 'Contact Point:',
  'Award per Item:', 'Inclusion of e-Auctions :', 'NUTS codes:', 'Estimated value (EUR):', 'Awarded (CAN) value:',
  'Above or Below threshold:', 'Time-limit for receipt of tenders or requests to participate:',
  'Deadline for dispatching invitations:', 'End of clarification period:', 'Tenders Opening Date:',
  'Allow suppliers to make an online Expression Of Interest:', 'Contract awarded in Lots:', 'Number Of Lots:',
  'Tenders For Lots:', 'Contract duration in months or years, including any options and renewals:',
  'Validity of Tender in days or months:', 'EU funding:', 'Multiple tenders will be accepted:',
  'Date of Publication/Invitation:', 'TED links for published notices:', 'Language of publication:', 'Number of openers:',
  'Date of Awarding:', 'Contract Award Date:', 'Date Accepted by Contractor:'
]

// Minimum gap between consecutive eTenders requests, and a short pause after a failed
// request before moving on. Keeps a run polite instead of firing everything back-to-back,
// and reduces the chance of tripping any anti-scraping protection.
const REQUEST_DELAY_MS = 600
const RETRY_DELAY_MS = 1500
const MAX_ATTEMPTS = 2

// eTenders' search results are paginated 10-per-page. The pagination links use this Wicket
// component id (confirmed against the live site); if eTenders ever changes it, discovery simply
// stops finding a "next page" and falls back to whatever page 1 alone returns - it fails visibly
// via a low "discovered" count in ingest_runs, not silently.
const PAGE_PARAM = 'd-3680175-p'
const MAX_PAGES = 20 // 20 pages x 10 results = up to 200 leads per run, bounded by the time budget below

// Hard ceiling on how long a single ingestion run is allowed to spend discovering + fetching,
// kept comfortably under Vercel's 60s function limit (see maxDuration in the cron route).
// If a run hits this, it stops cleanly, saves what it found, and picks up the rest next hour.
const TIME_BUDGET_MS = 48_000

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeText(html: string) {
  const $ = cheerio.load(html)
  $('script,style,noscript').remove()
  const text = $('body').text().replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{2,}/g, '\n').trim()
  return text
}

function field(text: string, label: string) {
  const start = text.indexOf(label)
  if (start < 0) return null
  const from = start + label.length
  let end = text.length
  for (const next of LABELS) {
    if (next === label) continue
    const i = text.indexOf(next, from)
    if (i >= 0 && i < end) end = i
  }
  return text.slice(from, end).trim() || null
}

function parseMoney(v: string | null) {
  if (!v) return null
  const n = Number(v.replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}
function parseIrishDate(v: string | null) {
  if (!v) return null
  const m = v.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/)
  if (!m) return null
  const [,dd,mm,yyyy,hh='00',mi='00'] = m
  // eTenders displays Irish local time. Convert Europe/Dublin wall time to an exact UTC instant, including DST.
  const naive = Date.UTC(Number(yyyy), Number(mm)-1, Number(dd), Number(hh), Number(mi), 0)
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/Dublin', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' })
  const parts = Object.fromEntries(fmt.formatToParts(new Date(naive)).filter(p => p.type !== 'literal').map(p => [p.type, p.value]))
  const renderedAsUtc = Date.UTC(Number(parts.year), Number(parts.month)-1, Number(parts.day), Number(parts.hour), Number(parts.minute), 0)
  const offsetMs = renderedAsUtc - naive
  return new Date(naive - offsetMs).toISOString()
}
function parseLines(v: string | null) {
  if (!v) return []
  return v.split(/\n+/).map(s => s.trim()).filter(Boolean)
}
function parseCpv(v: string | null) {
  return parseLines(v).map(line => line.match(/^(\d{8})/)?.[1]).filter((x): x is string => !!x)
}

// Wraps a single eTenders fetch with a couple of retries on transient failures
// (network blip, momentary 5xx). Does not retry 4xx responses - those won't fix themselves.
// `cookie`, when provided, is sent back to keep eTenders' session-scoped search state
// (the live-only filter and page position) intact across requests - see discoverLatestResourceIds.
async function fetchWithRetry(url: string, cookie?: string | null) {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'User-Agent': process.env.ETENDERS_USER_AGENT || 'UH-Tender-Finder/1.0',
          ...(cookie ? { Cookie: cookie } : {})
        }
      })
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`eTenders returned ${response.status}`)
        }
        throw new Error(`eTenders returned ${response.status} (attempt ${attempt})`)
      }
      return response
    } catch (e) {
      lastError = e
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

// eTenders' search results are session-scoped (Wicket framework): a plain stateless request with
// no cookie gets treated as a brand new visitor and silently falls back to the default full
// historical archive at page 1, ignoring both the live-only filter and any requested page number.
// This reads whatever session cookie the server set on a response so it can be sent back on the
// next request in the same discovery run.
function extractCookieHeader(response: Response) {
  const headers = response.headers as unknown as { getSetCookie?: () => string[] }
  const raw = headers.getSetCookie ? headers.getSetCookie() : []
  const fallback = response.headers.get('set-cookie')
  const cookies = raw.length ? raw : fallback ? [fallback] : []
  if (!cookies.length) return null
  return cookies.map(c => c.split(';')[0]).join('; ')
}

function extractResourceIds(html: string) {
  const $ = cheerio.load(html)
  const ids: string[] = []
  $('a[href*="prepareViewCfTWS.do"]').each((_, el) => {
    const href = $(el).attr('href') || ''
    const id = href.match(/resourceId=(\d+)/)?.[1]
    if (id && !ids.includes(id)) ids.push(id)
  })
  // Fallback catches resource IDs visible in the result table if link markup changes.
  if (!ids.length) {
    for (const m of html.matchAll(/resourceId[=\x26amp;]+(\d{5,})/g)) if (!ids.includes(m[1])) ids.push(m[1])
  }
  return ids
}

// Walks eTenders' paginated "currently live" search results, collecting resource IDs across
// pages until `limit` is reached, a page yields nothing new (end of results, or the pagination
// markup changed and we can no longer find a next page), or MAX_PAGES is hit. Holds a session
// cookie across the whole walk - without it, page 2+ silently resets to page 1 of the wrong list.
export async function discoverLatestResourceIds(limit = 60) {
  const ids: string[] = []
  let cookie: string | null = null
  for (let page = 1; page <= MAX_PAGES && ids.length < limit; page++) {
    const url = page === 1 ? ETENDERS_SEARCH_URL : `${ETENDERS_SEARCH_URL}&${PAGE_PARAM}=${page}`
    let response: Response
    try {
      response = await fetchWithRetry(url, cookie)
    } catch {
      // A failed page (beyond page 1) just ends discovery for this run rather than failing the
      // whole scan - whatever was already collected is still used.
      break
    }
    const setCookie = extractCookieHeader(response)
    if (setCookie) cookie = setCookie
    const html = await response.text()
    const pageIds = extractResourceIds(html)
    const newIds = pageIds.filter(id => !ids.includes(id))
    if (!newIds.length) break // no more results, or pagination stopped changing the page
    ids.push(...newIds)
    if (page < MAX_PAGES) await sleep(REQUEST_DELAY_MS)
  }
  return ids.slice(0, Math.max(1, limit))
}

export async function fetchTender(resourceId: string, rules: TaxonomyRule[]) {
  const sourceUrl = `${ETENDERS_DETAIL_BASE}${resourceId}`
  const response = await fetchWithRetry(sourceUrl)
  const html = await response.text()
  const text = normalizeText(html)
  const title = field(text, 'Title:') || cheerio.load(html)('h1,h2').first().text().replace(/^CfT:\s*/i,'').trim() || `eTenders ${resourceId}`
  const description = field(text, 'Description:')
  const procurementType = field(text, 'Procurement Type:')
  const cpvCodes = parseCpv(field(text, 'CPV Codes:'))
  const supply = classifySupplyOnly(title, description, procurementType)
  const scored = scoreTender(title, description, cpvCodes, rules)
  const deadline = parseIrishDate(field(text, 'Time-limit for receipt of tenders or requests to participate:'))
  const published = parseIrishDate(field(text, 'Date of Publication/Invitation:'))
  const lotsText = field(text, 'Number Of Lots:')
  const numberOfLots = lotsText ? Number(lotsText.match(/\d+/)?.[0] || 0) || null : null
  const lotNames = [...text.matchAll(/Lot Name\(\d+\)\s*([^\n]+)/g)].map(m => m[1].trim())
  const status = deadline && new Date(deadline).getTime() < Date.now() ? 'closed' : 'open'
  return {
    resource_id: resourceId,
    title,
    authority: field(text, 'Name of Contracting Authority:'),
    description,
    procurement_type: procurementType,
    procedure: field(text, 'Procedure:'),
    contract_type: field(text, 'CfT Involves:'),
    cpv_codes: cpvCodes,
    estimated_value: parseMoney(field(text, 'Estimated value (EUR):')),
    published_at: published,
    deadline_at: deadline,
    clarification_deadline_at: parseIrishDate(field(text, 'End of clarification period:')),
    nuts_codes: parseLines(field(text, 'NUTS codes:')).filter(x => /^[A-Z]{2}/.test(x)),
    number_of_lots: numberOfLots,
    lot_names: lotNames,
    source_url: sourceUrl,
    relevance_score: scored.score,
    categories: scored.categories,
    supply_only_status: supply.status,
    supply_only_reason: supply.reason,
    status,
    last_seen_at: new Date().toISOString()
  }
}

export async function runIngestion(limit = 60) {
  const runStartedMs = Date.now()
  const admin = createAdminClient()
  const started = new Date().toISOString()
  const { data: rules, error: ruleError } = await admin.from('tender_taxonomy').select('*').eq('active', true)
  if (ruleError) throw ruleError
  const ids = await discoverLatestResourceIds(limit)
  let inserted = 0, updated = 0, eligible = 0, mixed = 0, failed = 0, skipped = 0
  const errors: string[] = []
  for (let i = 0; i < ids.length; i++) {
    if (Date.now() - runStartedMs > TIME_BUDGET_MS) {
      skipped = ids.length - i
      errors.push(`Time budget reached: ${skipped} discovered notice(s) not processed this run, will be picked up next scan.`)
      break
    }
    const id = ids[i]
    try {
      const tender = await fetchTender(id, (rules || []) as TaxonomyRule[])
      const { data: existing } = await admin.from('tenders').select('id').eq('resource_id', id).maybeSingle()
      const { error } = await admin.from('tenders').upsert(tender, { onConflict: 'resource_id' })
      if (error) throw error
      existing ? updated++ : inserted++
      if (tender.supply_only_status === 'eligible' && tender.relevance_score >= 20) eligible++
      if (tender.supply_only_status === 'mixed') mixed++
    } catch (e) {
      failed++
      errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`)
    }
    // Space requests out so a deep run doesn't fire back-to-back against eTenders.
    if (i < ids.length - 1) await sleep(REQUEST_DELAY_MS)
  }
  const finished = new Date().toISOString()
  await admin.from('ingest_runs').insert({ started_at: started, finished_at: finished, discovered: ids.length, inserted, updated, eligible, mixed, failed, errors })
  return { started, finished, discovered: ids.length, inserted, updated, eligible, mixed, failed, skipped, errors }
}
