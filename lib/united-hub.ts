import { createAdminClient } from '@/lib/supabase/admin'

type HubSource = 'tender' | 'planning'
type HubRow = {
  source: HubSource
  external_id: string
  title: string
  summary: string | null
  location: string | null
  closing_date: string | null
  estimated_value: string | number | null
  relevance_score: number
  source_url: string | null
  active: boolean
  raw_data: Record<string, unknown>
}

const PAGE_SIZE = 500
const MIN_RELEVANCE = Math.max(0, Math.min(100, Number(process.env.UNITED_HUB_MIN_RELEVANCE || 20)))

function config() {
  const baseUrl = (process.env.UNITED_HUB_URL || '').replace(/\/$/, '')
  const apiKey = process.env.UNITED_HUB_INGEST_API_KEY || ''
  return { baseUrl, apiKey, enabled: Boolean(baseUrl && apiKey) }
}

async function pushBatch(rows: HubRow[]) {
  if (!rows.length) return 0
  const { baseUrl, apiKey, enabled } = config()
  if (!enabled) return 0
  const response = await fetch(`${baseUrl}/api/opportunities/ingest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(rows),
    cache: 'no-store'
  })
  const body = await response.text()
  if (!response.ok) throw new Error(`United Hub sync failed (${response.status}): ${body.slice(0, 500)}`)
  try { return Number(JSON.parse(body)?.upserted || rows.length) } catch { return rows.length }
}

function tenderToHub(t: any): HubRow {
  const eligible = t.admin_override !== 'reject' && (t.supply_only_status === 'eligible' || t.admin_override === 'approve')
  const deadlineOpen = !t.deadline_at || new Date(t.deadline_at).getTime() > Date.now()
  return {
    source: 'tender',
    external_id: String(t.resource_id || t.id),
    title: t.title || 'eTender opportunity',
    summary: t.description || t.supply_only_reason || null,
    location: t.authority || null,
    closing_date: t.deadline_at ? String(t.deadline_at).slice(0, 10) : null,
    estimated_value: t.estimated_value ?? null,
    relevance_score: Number(t.relevance_score || 0),
    source_url: t.source_url || null,
    active: t.status === 'open' && eligible && deadlineOpen && Number(t.relevance_score || 0) >= MIN_RELEVANCE,
    raw_data: { categories: t.categories || [], authority: t.authority || null, supply_only_status: t.supply_only_status, procedure: t.procedure || null }
  }
}

function planningToHub(p: any): HubRow {
  const stageActive = ['watch', 'granted', 'starting_soon', 'active'].includes(p.project_stage)
  const location = [p.development_address, p.planning_authority].filter(Boolean).join(' · ') || null
  const value = p.estimated_opportunity_band || (p.estimated_opportunity_low != null && p.estimated_opportunity_high != null ? `€${Number(p.estimated_opportunity_low).toLocaleString()}–€${Number(p.estimated_opportunity_high).toLocaleString()}` : null)
  return {
    source: 'planning',
    external_id: String(p.source_object_id || p.id),
    title: p.development_description || p.development_address || 'Planning opportunity',
    summary: p.score_reason || p.development_description || null,
    location,
    closing_date: p.commencement_date || p.expiry_date || null,
    estimated_value: value,
    relevance_score: Number(p.relevance_score || 0),
    source_url: p.source_url || null,
    active: !p.ignored && stageActive && Number(p.relevance_score || 0) >= MIN_RELEVANCE,
    raw_data: { categories: p.categories || [], project_stage: p.project_stage, planning_authority: p.planning_authority || null, application_number: p.application_number || null, residential_units: p.residential_units ?? null, commencement_date: p.commencement_date || null }
  }
}

async function syncTable(source: HubSource, full: boolean, since?: string) {
  const admin = createAdminClient()
  let offset = 0
  let sent = 0
  let scanned = 0
  const errors: string[] = []
  while (true) {
    let query: any
    if (source === 'tender') {
      query = admin.from('tenders').select('id,resource_id,title,authority,description,deadline_at,estimated_value,relevance_score,source_url,status,supply_only_status,supply_only_reason,admin_override,categories,procedure,last_seen_at').gte('relevance_score', MIN_RELEVANCE).order('last_seen_at', { ascending: false }).range(offset, offset + PAGE_SIZE - 1)
    } else {
      query = admin.from('planning_applications').select('id,source_object_id,planning_authority,application_number,development_description,development_address,expiry_date,commencement_date,estimated_opportunity_low,estimated_opportunity_high,estimated_opportunity_band,relevance_score,source_url,ignored,project_stage,score_reason,categories,residential_units,last_seen_at').gte('relevance_score', MIN_RELEVANCE).order('last_seen_at', { ascending: false }).range(offset, offset + PAGE_SIZE - 1)
    }
    if (!full && since) query = query.gte('last_seen_at', since)
    const { data, error } = await query
    if (error) throw error
    const rows = data || []
    if (!rows.length) break
    scanned += rows.length
    try { sent += await pushBatch(rows.map(source === 'tender' ? tenderToHub : planningToHub)) }
    catch (e) { errors.push(e instanceof Error ? e.message : String(e)); break }
    if (rows.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return { scanned, sent, errors }
}

export async function syncUnitedHubSource(source: HubSource, options: { full?: boolean; since?: string } = {}) {
  const cfg = config()
  if (!cfg.enabled) return { enabled: false, reason: 'UNITED_HUB_URL or UNITED_HUB_INGEST_API_KEY is not configured', source, scanned: 0, sent: 0, errors: [] as string[] }
  const full = options.full === true
  const since = options.since || new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const result = await syncTable(source, full, since)
  return { enabled: true, full, source, min_relevance: MIN_RELEVANCE, ...result }
}

export async function syncUnitedHubOpportunities(options: { full?: boolean; since?: string } = {}) {
  const cfg = config()
  if (!cfg.enabled) return { enabled: false, reason: 'UNITED_HUB_URL or UNITED_HUB_INGEST_API_KEY is not configured', tenders: { scanned: 0, sent: 0, errors: [] }, planning: { scanned: 0, sent: 0, errors: [] } }
  const full = options.full === true
  const since = options.since || new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const [tenders, planning] = await Promise.all([syncTable('tender', full, since), syncTable('planning', full, since)])
  return { enabled: true, full, min_relevance: MIN_RELEVANCE, tenders, planning }
}
