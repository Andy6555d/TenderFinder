import * as cheerio from 'cheerio'
import { ETENDERS_DETAIL_BASE, ETENDERS_SEARCH_URL } from '@/lib/constants'
import { createAdminClient } from '@/lib/supabase/admin'
import { CLASSIFIER_VERSION, classifySupplyOnly, scoreTender } from '@/lib/relevance'
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

const REQUEST_DELAY_MS = 550
const RETRY_DELAY_MS = 1400
const MAX_ATTEMPTS = 2
const PAGE_PARAM = 'd-3680175-p'
const RESULTS_PER_PAGE = 10
const TIME_BUDGET_MS = 48_000
const INCREMENTAL_LIMIT = 30
const BACKFILL_PAGES_PER_RUN = 3
const REFRESH_PER_RUN = 5
const REFRESH_AFTER_HOURS = 24

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeText(html: string) {
  const $ = cheerio.load(html)
  $('script,style,noscript').remove()
  return $('body').text().replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{2,}/g, '\n').trim()
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
  const [, dd, mm, yyyy, hh = '00', mi = '00'] = m
  const naive = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), 0)
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  })
  const parts = Object.fromEntries(fmt.formatToParts(new Date(naive)).filter(p => p.type !== 'literal').map(p => [p.type, p.value]))
  const renderedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), 0)
  return new Date(naive - (renderedAsUtc - naive)).toISOString()
}

function parseLines(v: string | null) {
  return v ? v.split(/\n+/).map(s => s.trim()).filter(Boolean) : []
}

function parseCpv(v: string | null) {
  return parseLines(v).map(line => line.match(/^(\d{8})/)?.[1]).filter((x): x is string => !!x)
}

async function fetchWithRetry(url: string, cookie?: string | null) {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'User-Agent': process.env.ETENDERS_USER_AGENT || 'UH-Tender-Finder/2.0',
          ...(cookie ? { Cookie: cookie } : {})
        }
      })
      if (!response.ok) throw new Error(`eTenders returned ${response.status}`)
      return response
    } catch (error) {
      lastError = error
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function extractCookieHeader(response: Response) {
  const headers = response.headers as unknown as { getSetCookie?: () => string[] }
  const raw = headers.getSetCookie ? headers.getSetCookie() : []
  const fallback = response.headers.get('set-cookie')
  const cookies = raw.length ? raw : fallback ? [fallback] : []
  return cookies.length ? cookies.map(c => c.split(';')[0]).join('; ') : null
}

function extractResourceIds(html: string) {
  const $ = cheerio.load(html)
  const ids: string[] = []
  $('a[href*="prepareViewCfTWS.do"]').each((_, el) => {
    const href = $(el).attr('href') || ''
    const id = href.match(/resourceId=(\d+)/)?.[1]
    if (id && !ids.includes(id)) ids.push(id)
  })
  if (!ids.length) {
    for (const m of html.matchAll(/resourceId[=\x26amp;]+(\d{5,})/g)) if (!ids.includes(m[1])) ids.push(m[1])
  }
  return ids
}

function parseReportedLiveCount(html: string) {
  const text = cheerio.load(html)('body').text().replace(/\s+/g, ' ')
  const patterns = [
    /(?:showing|displaying)\s+\d+\s+(?:to|-)\s+\d+\s+of\s+([\d,]+)/i,
    /\bof\s+([\d,]+)\s+(?:results|items|records|entries|opportunities)\b/i,
    /\b([\d,]+)\s+(?:results|opportunities)\b/i
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) {
      const n = Number(m[1].replace(/,/g, ''))
      if (Number.isFinite(n) && n >= 0) return n
    }
  }
  return null
}

type SearchSession = {
  cookie: string | null
  page1Ids: string[]
  page1Html: string
  reportedCount: number | null
}

async function startSearchSession(): Promise<SearchSession> {
  const response = await fetchWithRetry(ETENDERS_SEARCH_URL)
  const html = await response.text()
  return {
    cookie: extractCookieHeader(response),
    page1Ids: extractResourceIds(html),
    page1Html: html,
    reportedCount: parseReportedLiveCount(html)
  }
}

async function fetchSearchPage(session: SearchSession, page: number) {
  if (page === 1) return { ids: session.page1Ids, html: session.page1Html }
  const response = await fetchWithRetry(`${ETENDERS_SEARCH_URL}&${PAGE_PARAM}=${page}`, session.cookie)
  const newCookie = extractCookieHeader(response)
  if (newCookie) session.cookie = newCookie
  const html = await response.text()
  const ids = extractResourceIds(html)
  if (ids.length && session.page1Ids.length && ids.join(',') === session.page1Ids.join(',')) {
    throw new Error(`eTenders pagination reset to page 1 while requesting page ${page}; backfill cursor was not advanced.`)
  }
  return { ids, html }
}

async function discoverNewest(session: SearchSession, limit = INCREMENTAL_LIMIT) {
  const ids: string[] = []
  const pages = Math.max(1, Math.ceil(limit / RESULTS_PER_PAGE))
  for (let page = 1; page <= pages && ids.length < limit; page++) {
    const { ids: pageIds } = await fetchSearchPage(session, page)
    for (const id of pageIds) if (!ids.includes(id)) ids.push(id)
    if (page < pages) await sleep(REQUEST_DELAY_MS)
  }
  return ids.slice(0, limit)
}

export async function fetchTender(resourceId: string, rules: TaxonomyRule[]) {
  const sourceUrl = `${ETENDERS_DETAIL_BASE}${resourceId}`
  const response = await fetchWithRetry(sourceUrl)
  const html = await response.text()
  const text = normalizeText(html)
  const title = field(text, 'Title:') || cheerio.load(html)('h1,h2').first().text().replace(/^CfT:\s*/i, '').trim() || `eTenders ${resourceId}`
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
  const now = new Date().toISOString()
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
    classifier_version: CLASSIFIER_VERSION,
    last_classified_at: now,
    status,
    last_seen_at: now
  }
}

type Counters = {
  discovered: number
  inserted: number
  updated: number
  eligible: number
  mixed: number
  failed: number
  skipped_existing: number
  refreshed: number
  errors: string[]
}

function blankCounters(): Counters {
  return { discovered: 0, inserted: 0, updated: 0, eligible: 0, mixed: 0, failed: 0, skipped_existing: 0, refreshed: 0, errors: [] }
}

function mergeCounters(into: Counters, from: Counters) {
  for (const key of ['discovered', 'inserted', 'updated', 'eligible', 'mixed', 'failed', 'skipped_existing', 'refreshed'] as const) into[key] += from[key]
  into.errors.push(...from.errors)
}

async function existingMap(ids: string[]) {
  if (!ids.length) return new Map<string, { id: string; last_seen_at: string | null }>()
  const admin = createAdminClient()
  const { data, error } = await admin.from('tenders').select('id,resource_id,last_seen_at').in('resource_id', ids)
  if (error) throw error
  return new Map((data || []).map(row => [row.resource_id, { id: row.id, last_seen_at: row.last_seen_at }]))
}

async function processIds(ids: string[], rules: TaxonomyRule[], runStartedMs: number, forceRefresh = false) {
  const admin = createAdminClient()
  const counters = blankCounters()
  counters.discovered = ids.length
  const existing = await existingMap(ids)

  for (let i = 0; i < ids.length; i++) {
    if (Date.now() - runStartedMs > TIME_BUDGET_MS) {
      counters.errors.push(`Time budget reached with ${ids.length - i} notice(s) left in this batch. Cursor was not advanced past an incomplete backfill page.`)
      return { counters, completed: false }
    }
    const id = ids[i]
    const prev = existing.get(id)
    if (prev && !forceRefresh) {
      counters.skipped_existing++
      continue
    }
    try {
      const tender = await fetchTender(id, rules)
      const { error } = await admin.from('tenders').upsert(tender, { onConflict: 'resource_id' })
      if (error) throw error
      if (prev) {
        counters.updated++
        if (forceRefresh) counters.refreshed++
      } else counters.inserted++
      if (tender.supply_only_status === 'eligible' && tender.relevance_score >= 20) counters.eligible++
      if (tender.supply_only_status === 'mixed') counters.mixed++
    } catch (error) {
      counters.failed++
      counters.errors.push(`${id}: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (i < ids.length - 1) await sleep(REQUEST_DELAY_MS)
  }
  return { counters, completed: true }
}

async function loadRules() {
  const admin = createAdminClient()
  const { data, error } = await admin.from('tender_taxonomy').select('*').eq('active', true)
  if (error) throw error
  return (data || []) as TaxonomyRule[]
}

async function closeExpiredTenders() {
  const admin = createAdminClient()
  await admin.from('tenders').update({ status: 'closed' }).eq('status', 'open').lt('deadline_at', new Date().toISOString())
}

async function getBackfillState() {
  const admin = createAdminClient()
  const { data, error } = await admin.from('ingestion_state').select('*').eq('key', 'live_backfill').maybeSingle()
  if (error) throw error
  if (data) return data as any
  const { data: created, error: createError } = await admin.from('ingestion_state').insert({ key: 'live_backfill', next_page: 1, complete: false, cycle_started_at: new Date().toISOString() }).select('*').single()
  if (createError) throw createError
  return created as any
}

async function saveBackfillState(values: Record<string, unknown>) {
  const admin = createAdminClient()
  const { error } = await admin.from('ingestion_state').upsert({ key: 'live_backfill', ...values, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw error
}

async function runBackfill(session: SearchSession, rules: TaxonomyRule[], runStartedMs: number, maxPages = BACKFILL_PAGES_PER_RUN) {
  const totals = blankCounters()
  const state = await getBackfillState()
  if (state.complete) return { counters: totals, pagesScanned: 0, cursorStart: state.next_page, cursorEnd: state.next_page, complete: true }

  const cursorStart = Math.max(1, Number(state.next_page || 1))
  let page = cursorStart
  let pagesScanned = 0
  for (; pagesScanned < maxPages; page++) {
    if (Date.now() - runStartedMs > TIME_BUDGET_MS - 5000) break

    let pageIds: string[]
    try {
      const result = await fetchSearchPage(session, page)
      pageIds = result.ids
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      totals.errors.push(`Backfill page ${page}: ${msg}`)
      await saveBackfillState({ next_page: page, complete: false, reported_live_count: session.reportedCount, last_error: msg })
      break
    }

    if (!pageIds.length) {
      await saveBackfillState({ next_page: page, complete: true, reported_live_count: session.reportedCount, cycle_completed_at: new Date().toISOString(), last_error: null })
      return { counters: totals, pagesScanned, cursorStart, cursorEnd: page, complete: true }
    }

    const result = await processIds(pageIds, rules, runStartedMs, false)
    mergeCounters(totals, result.counters)
    if (!result.completed) {
      await saveBackfillState({ next_page: page, complete: false, reported_live_count: session.reportedCount, last_error: 'Time budget ended before the page was fully processed.' })
      break
    }

    pagesScanned++
    await saveBackfillState({ next_page: page + 1, complete: false, reported_live_count: session.reportedCount, last_error: null })
    if (pagesScanned < maxPages) await sleep(REQUEST_DELAY_MS)
  }

  const latest = await getBackfillState()
  return { counters: totals, pagesScanned, cursorStart, cursorEnd: Number(latest.next_page || page), complete: !!latest.complete }
}

async function refreshStaleRelevant(rules: TaxonomyRule[], runStartedMs: number) {
  const totals = blankCounters()
  if (Date.now() - runStartedMs > TIME_BUDGET_MS - 9000) return totals
  const admin = createAdminClient()
  const staleBefore = new Date(Date.now() - REFRESH_AFTER_HOURS * 60 * 60 * 1000).toISOString()
  const { data, error } = await admin
    .from('tenders')
    .select('resource_id')
    .eq('status', 'open')
    .gte('relevance_score', 10)
    .lt('last_seen_at', staleBefore)
    .order('last_seen_at', { ascending: true })
    .limit(REFRESH_PER_RUN)
  if (error) {
    totals.errors.push(`Refresh queue: ${error.message}`)
    return totals
  }
  const ids = (data || []).map(x => x.resource_id)
  if (!ids.length) return totals
  const result = await processIds(ids, rules, runStartedMs, true)
  mergeCounters(totals, result.counters)
  return totals
}

export async function runIngestion() {
  const runStartedMs = Date.now()
  const started = new Date().toISOString()
  const admin = createAdminClient()
  const rules = await loadRules()
  const totals = blankCounters()
  let pagesScanned = 0
  let cursorStart: number | null = null
  let cursorEnd: number | null = null
  let reportedLiveCount: number | null = null
  let backfillComplete = false

  await closeExpiredTenders()

  try {
    const session = await startSearchSession()
    reportedLiveCount = session.reportedCount

    // 1) Incremental lane: always inspect the newest notices, but only fetch detail pages for IDs
    // that are not already stored. This keeps newly published opportunities appearing quickly.
    const newestIds = await discoverNewest(session, INCREMENTAL_LIMIT)
    const incremental = await processIds(newestIds, rules, runStartedMs, false)
    mergeCounters(totals, incremental.counters)

    // 2) Backfill lane: walk the complete currently-live catalogue with a persistent page cursor.
    // A page cursor advances only after every ID on that page has either been processed or safely
    // recognised as already present. A timeout therefore cannot permanently skip a page.
    if (Date.now() - runStartedMs < TIME_BUDGET_MS - 7000) {
      const backfill = await runBackfill(session, rules, runStartedMs)
      mergeCounters(totals, backfill.counters)
      pagesScanned = backfill.pagesScanned
      cursorStart = backfill.cursorStart
      cursorEnd = backfill.cursorEnd
      backfillComplete = backfill.complete
    }

    // 3) Refresh a small number of previously relevant open notices so changed deadlines/statuses
    // eventually reconcile without repeatedly refetching every stored notice every hour.
    if (Date.now() - runStartedMs < TIME_BUDGET_MS - 8000) {
      const refreshed = await refreshStaleRelevant(rules, runStartedMs)
      mergeCounters(totals, refreshed)
    }
  } catch (error) {
    totals.failed++
    totals.errors.push(error instanceof Error ? error.message : String(error))
  }

  const finished = new Date().toISOString()
  await admin.from('ingest_runs').insert({
    started_at: started,
    finished_at: finished,
    mode: 'scheduled',
    discovered: totals.discovered,
    inserted: totals.inserted,
    updated: totals.updated,
    eligible: totals.eligible,
    mixed: totals.mixed,
    failed: totals.failed,
    skipped_existing: totals.skipped_existing,
    refreshed: totals.refreshed,
    pages_scanned: pagesScanned,
    cursor_start: cursorStart,
    cursor_end: cursorEnd,
    reported_live_count: reportedLiveCount,
    errors: totals.errors
  })

  return {
    started,
    finished,
    reportedLiveCount,
    backfill: { pagesScanned, cursorStart, cursorEnd, complete: backfillComplete },
    ...totals
  }
}

export async function resetBackfill() {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { error } = await admin.from('ingestion_state').upsert({
    key: 'live_backfill', next_page: 1, complete: false, reported_live_count: null,
    cycle_started_at: now, cycle_completed_at: null, last_error: null, updated_at: now
  }, { onConflict: 'key' })
  if (error) throw error
}

export async function reclassifyStoredTenders() {
  const admin = createAdminClient()
  const rules = await loadRules()
  let offset = 0
  let scanned = 0
  let changed = 0
  const pageSize = 500

  while (true) {
    const { data, error } = await admin
      .from('tenders')
      .select('id,title,description,procurement_type,cpv_codes,relevance_score,supply_only_status,categories,classifier_version')
      .order('id')
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    if (!data?.length) break

    const updates = data.map((t: any) => {
      const supply = classifySupplyOnly(t.title, t.description, t.procurement_type)
      const score = scoreTender(t.title, t.description, t.cpv_codes || [], rules)
      if (
        t.relevance_score !== score.score ||
        t.supply_only_status !== supply.status ||
        JSON.stringify(t.categories || []) !== JSON.stringify(score.categories) ||
        t.classifier_version !== CLASSIFIER_VERSION
      ) changed++
      return {
        id: t.id,
        relevance_score: score.score,
        categories: score.categories,
        supply_only_status: supply.status,
        supply_only_reason: supply.reason,
        classifier_version: CLASSIFIER_VERSION,
        last_classified_at: new Date().toISOString()
      }
    })

    const { data: applied, error: applyError } = await admin.rpc('apply_tender_classifications', { p_updates: updates })
    if (applyError) throw applyError
    scanned += Number(applied || updates.length)
    if (data.length < pageSize) break
    offset += pageSize
  }

  return { scanned, changed, classifierVersion: CLASSIFIER_VERSION }
}
