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

const MAX_ATTEMPTS = 2
const RETRY_DELAY_MS = 900
const PAGE_PARAM = 'd-3680175-p'
const RESULTS_PER_PAGE = 10
const INCREMENTAL_PAGES = 5
const REFRESH_PER_RUN = 8
const REFRESH_AFTER_HOURS = 24
const FAST_SEARCH_CONCURRENCY = Math.max(4, Number(process.env.ETENDERS_SEARCH_CONCURRENCY || 14))
const FAST_DETAIL_CONCURRENCY = Math.max(3, Number(process.env.ETENDERS_DETAIL_CONCURRENCY || 8))
const FAST_PREFILTER_SCORE = Math.max(1, Number(process.env.ETENDERS_PREFILTER_SCORE || 8))

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
          'User-Agent': process.env.ETENDERS_USER_AGENT || 'UH-Tender-Finder/3.0',
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
    /(?:showing|displaying)\s*:?\s*\d+\s*(?:to|-)\s*\d+\s*\|?\s*([\d,]+)\s+results\s+in\s+total/i,
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

type SearchSummary = {
  resourceId: string
  title: string
  authority: string | null
  info: string
  rowText: string
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
  const html = await response.text()
  const ids = extractResourceIds(html)
  if (ids.length && session.page1Ids.length && ids.join(',') === session.page1Ids.join(',')) {
    throw new Error(`eTenders pagination reset to page 1 while requesting page ${page}.`)
  }
  return { ids, html }
}

function extractSearchSummaries(html: string): SearchSummary[] {
  const $ = cheerio.load(html)
  const out: SearchSummary[] = []

  $('tr').each((_, row) => {
    const $row = $(row)
    const link = $row.find('a[href*="prepareViewCfTWS.do"]').first()
    if (!link.length) return
    const href = link.attr('href') || ''
    const resourceId = href.match(/resourceId=(\d+)/)?.[1]
    if (!resourceId) return
    const cells = $row.find('td').map((__, td) => $(td).text().replace(/\s+/g, ' ').trim()).get()
    const title = link.text().replace(/\s+/g, ' ').trim() || cells[1] || `eTenders ${resourceId}`
    const rowText = cells.join(' | ')
    // Current eTenders layout: #, Title, Resource ID, CA, Info, Date, Deadline, Procedure, ...
    const authority = cells[3] || null
    const info = cells[4] || rowText
    out.push({ resourceId, title, authority, info, rowText })
  })

  if (!out.length) {
    $('a[href*="prepareViewCfTWS.do"]').each((_, el) => {
      const href = $(el).attr('href') || ''
      const resourceId = href.match(/resourceId=(\d+)/)?.[1]
      if (!resourceId || out.some(x => x.resourceId === resourceId)) return
      const title = $(el).text().replace(/\s+/g, ' ').trim() || `eTenders ${resourceId}`
      const parentText = $(el).closest('tr,li,div').text().replace(/\s+/g, ' ').trim()
      out.push({ resourceId, title, authority: null, info: parentText, rowText: parentText })
    })
  }
  return out
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (!items.length) return []
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++
      if (index >= items.length) break
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

function candidateFromSummary(summary: SearchSummary, rules: TaxonomyRule[]) {
  const scored = scoreTender(summary.title, summary.info, [], rules)
  return { ...summary, preScore: scored.score, preCategories: scored.categories }
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
  candidates: number
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
  return { discovered: 0, candidates: 0, inserted: 0, updated: 0, eligible: 0, mixed: 0, failed: 0, skipped_existing: 0, refreshed: 0, errors: [] }
}

async function existingMap(ids: string[]) {
  const admin = createAdminClient()
  const map = new Map<string, { id: string; last_seen_at: string | null }>()
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150)
    if (!chunk.length) continue
    const { data, error } = await admin.from('tenders').select('id,resource_id,last_seen_at').in('resource_id', chunk)
    if (error) throw error
    for (const row of data || []) map.set(row.resource_id, { id: row.id, last_seen_at: row.last_seen_at })
  }
  return map
}

async function loadRules() {
  const admin = createAdminClient()
  const { data, error } = await admin.from('tender_taxonomy').select('*').eq('active', true)
  if (error) throw error
  return (data || []) as TaxonomyRule[]
}

async function upsertTenderBatch(tenders: any[], existing: Map<string, { id: string; last_seen_at: string | null }>, counters: Counters, forceRefresh: boolean) {
  const admin = createAdminClient()
  for (let i = 0; i < tenders.length; i += 50) {
    const batch = tenders.slice(i, i + 50)
    if (!batch.length) continue
    const { error } = await admin.from('tenders').upsert(batch, { onConflict: 'resource_id' })
    if (error) throw error
    for (const tender of batch) {
      if (existing.has(tender.resource_id)) {
        counters.updated++
        if (forceRefresh) counters.refreshed++
      } else counters.inserted++
      if (tender.supply_only_status === 'eligible' && tender.relevance_score >= 20) counters.eligible++
      if (tender.supply_only_status === 'mixed') counters.mixed++
    }
  }
}

async function processIdsConcurrent(ids: string[], rules: TaxonomyRule[], options?: { forceRefresh?: boolean; concurrency?: number }) {
  const counters = blankCounters()
  counters.discovered = ids.length
  const existing = await existingMap(ids)
  const forceRefresh = !!options?.forceRefresh
  const wanted = forceRefresh ? ids : ids.filter(id => !existing.has(id))
  counters.skipped_existing = ids.length - wanted.length

  const fetched = await mapConcurrent(wanted, options?.concurrency || FAST_DETAIL_CONCURRENCY, async id => {
    try {
      return { tender: await fetchTender(id, rules), error: null as string | null }
    } catch (error) {
      return { tender: null, error: `${id}: ${error instanceof Error ? error.message : String(error)}` }
    }
  })

  const good = fetched.flatMap(x => x.tender ? [x.tender] : [])
  for (const item of fetched) {
    if (item.error) {
      counters.failed++
      counters.errors.push(item.error)
    }
  }
  await upsertTenderBatch(good, existing, counters, forceRefresh)
  return counters
}

async function closeExpiredTenders() {
  const admin = createAdminClient()
  await admin.from('tenders').update({ status: 'closed' }).eq('status', 'open').lt('deadline_at', new Date().toISOString())
}

async function saveFastState(values: Record<string, unknown>) {
  const admin = createAdminClient()
  const { error } = await admin.from('ingestion_state').upsert({ key: 'live_backfill', ...values, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw error
}

async function logRun(mode: string, started: string, totals: Counters, extra: Record<string, unknown> = {}) {
  const admin = createAdminClient()
  const finished = new Date().toISOString()
  await admin.from('ingest_runs').insert({
    started_at: started,
    finished_at: finished,
    mode,
    discovered: totals.discovered,
    candidates: totals.candidates,
    inserted: totals.inserted,
    updated: totals.updated,
    eligible: totals.eligible,
    mixed: totals.mixed,
    failed: totals.failed,
    skipped_existing: totals.skipped_existing,
    refreshed: totals.refreshed,
    pages_scanned: Number(extra.pagesScanned || 0),
    cursor_start: null,
    cursor_end: null,
    reported_live_count: extra.reportedLiveCount ?? null,
    errors: totals.errors
  })
  return finished
}

/**
 * FAST FULL REFRESH
 * 1) Downloads every CURRENT search-results page in parallel. Those pages already contain title + summary.
 * 2) Applies cheap merchant-relevance filtering to the catalogue without opening 2,800 detail pages.
 * 3) Opens only the plausible merchant candidates, in bounded parallel batches, then applies official
 *    Procurement Type + CPV + context-aware supply-only classification.
 *
 * This turns initial indexing from a days-long serial crawl into a minutes-scale operation while keeping
 * the detail-page traffic bounded to the small candidate pool.
 */
export async function runFastFullRefresh() {
  const started = new Date().toISOString()
  const startedMs = Date.now()
  const totals = blankCounters()
  const rules = await loadRules()
  await closeExpiredTenders()

  try {
    const session = await startSearchSession()
    const reportedLiveCount = session.reportedCount || session.page1Ids.length
    const totalPages = Math.max(1, Math.ceil(reportedLiveCount / RESULTS_PER_PAGE))
    const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1)

    const pageResults = await mapConcurrent(pageNumbers, FAST_SEARCH_CONCURRENCY, async page => {
      try {
        return { page, result: await fetchSearchPage(session, page), error: null as string | null }
      } catch (error) {
        return { page, result: null, error: `Search page ${page}: ${error instanceof Error ? error.message : String(error)}` }
      }
    })

    const summariesById = new Map<string, SearchSummary>()
    for (const p of pageResults) {
      if (p.error) {
        totals.failed++
        totals.errors.push(p.error)
        continue
      }
      for (const summary of extractSearchSummaries(p.result!.html)) summariesById.set(summary.resourceId, summary)
    }

    const summaries = [...summariesById.values()]
    totals.discovered = summaries.length
    const candidates = summaries
      .map(s => candidateFromSummary(s, rules))
      .filter(s => s.preScore >= FAST_PREFILTER_SCORE && s.preCategories.length > 0)
      .sort((a, b) => b.preScore - a.preScore)
    totals.candidates = candidates.length

    // A full refresh deliberately re-opens every candidate, including existing ones, so live deadlines,
    // procurement type and CPVs are reconciled. Non-candidates already stored are not deleted: they may be
    // retained for pricing/audit history, but expired records are closed by closeExpiredTenders().
    const detailed = await processIdsConcurrent(candidates.map(c => c.resourceId), rules, { forceRefresh: true, concurrency: FAST_DETAIL_CONCURRENCY })
    totals.inserted += detailed.inserted
    totals.updated += detailed.updated
    totals.eligible += detailed.eligible
    totals.mixed += detailed.mixed
    totals.failed += detailed.failed
    totals.skipped_existing += detailed.skipped_existing
    totals.refreshed += detailed.refreshed
    totals.errors.push(...detailed.errors)

    const complete = pageResults.every(p => !p.error)
    const durationMs = Date.now() - startedMs
    await saveFastState({
      next_page: totalPages + 1,
      complete,
      reported_live_count: reportedLiveCount,
      cycle_started_at: started,
      cycle_completed_at: complete ? new Date().toISOString() : null,
      last_error: complete ? null : `${pageResults.filter(p => p.error).length} catalogue page(s) failed during fast refresh.`
    })
    const finished = await logRun('fast_full', started, totals, { pagesScanned: pageResults.filter(p => !p.error).length, reportedLiveCount })
    return { started, finished, durationMs, reportedLiveCount, totalPages, ...totals }
  } catch (error) {
    totals.failed++
    totals.errors.push(error instanceof Error ? error.message : String(error))
    const finished = await logRun('fast_full', started, totals)
    return { started, finished, durationMs: Date.now() - startedMs, reportedLiveCount: null, totalPages: 0, ...totals }
  }
}

/** Normal hourly lane: only newest search pages + a tiny stale refresh set. */
export async function runIngestion() {
  const started = new Date().toISOString()
  const totals = blankCounters()
  const rules = await loadRules()
  await closeExpiredTenders()
  let reportedLiveCount: number | null = null

  try {
    const session = await startSearchSession()
    reportedLiveCount = session.reportedCount
    const newestPages = await mapConcurrent(Array.from({ length: INCREMENTAL_PAGES }, (_, i) => i + 1), Math.min(INCREMENTAL_PAGES, 5), page => fetchSearchPage(session, page))
    const newestIds = [...new Set(newestPages.flatMap(p => p.ids))]
    const incremental = await processIdsConcurrent(newestIds, rules, { forceRefresh: false, concurrency: FAST_DETAIL_CONCURRENCY })
    Object.assign(totals, incremental)

    const admin = createAdminClient()
    const staleBefore = new Date(Date.now() - REFRESH_AFTER_HOURS * 60 * 60 * 1000).toISOString()
    const { data } = await admin
      .from('tenders')
      .select('resource_id')
      .eq('status', 'open')
      .gte('relevance_score', 10)
      .lt('last_seen_at', staleBefore)
      .order('last_seen_at', { ascending: true })
      .limit(REFRESH_PER_RUN)
    const refreshIds = (data || []).map(x => x.resource_id)
    if (refreshIds.length) {
      const refreshed = await processIdsConcurrent(refreshIds, rules, { forceRefresh: true, concurrency: Math.min(4, FAST_DETAIL_CONCURRENCY) })
      totals.updated += refreshed.updated
      totals.eligible += refreshed.eligible
      totals.mixed += refreshed.mixed
      totals.failed += refreshed.failed
      totals.refreshed += refreshed.refreshed
      totals.errors.push(...refreshed.errors)
    }
  } catch (error) {
    totals.failed++
    totals.errors.push(error instanceof Error ? error.message : String(error))
  }

  const finished = await logRun('scheduled', started, totals, { pagesScanned: INCREMENTAL_PAGES, reportedLiveCount })
  return { started, finished, reportedLiveCount, ...totals }
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
