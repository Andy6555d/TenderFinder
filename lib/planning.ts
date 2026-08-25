import { createAdminClient } from '@/lib/supabase/admin'

const ARCGIS_LAYER = process.env.PLANNING_ARCGIS_URL || 'https://services.arcgis.com/NzlPQPKn5QF9v2US/arcgis/rest/services/IrishPlanningApplications/FeatureServer/0'
const BCMS_RESOURCE_ID = process.env.BCMS_RESOURCE_ID || '0774e781-7af8-46da-b623-872e74cf541e'
const BCMS_API = process.env.BCMS_CKAN_API || 'https://data.nbco.gov.ie/api/3/action/datastore_search_sql'
const PAGE_SIZE = Math.min(2000, Math.max(100, Number(process.env.PLANNING_PAGE_SIZE || 2000)))
const NORMAL_PAGES = Math.max(1, Number(process.env.PLANNING_NORMAL_PAGES || 3))
const FULL_PAGES = Math.max(NORMAL_PAGES, Number(process.env.PLANNING_FULL_PAGES || 15))
const PENDING_PAGES = Math.max(1, Number(process.env.PLANNING_PENDING_PAGES || 30))
const PENDING_LOOKBACK_DAYS = Math.max(30, Number(process.env.PLANNING_PENDING_LOOKBACK_DAYS || 730))

type AnyRow = Record<string, any>

type Classification = {
  project_type: string; relevance_score: number; categories: string[]; ignored: boolean;
  low: number | null; high: number | null; band: string | null; reason: string; stage: string
}

function text(v: any) { return v == null ? '' : String(v).trim() }
function number(v: any): number | null { const n = Number(v); return Number.isFinite(n) ? n : null }
function int(v: any): number | null { const n = number(v); return n == null ? null : Math.round(n) }
function bool(v: any): boolean | null {
  if (v === true || v === 1) return true
  const s = text(v).toLowerCase(); if (!s) return null
  if (['true','yes','y','1','one off house','one-off house'].includes(s)) return true
  if (['false','no','n','0'].includes(s)) return false
  return null
}
function dateIso(v: any): string | null {
  if (v == null || v === '') return null
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
function pick(a: AnyRow, ...names: string[]) {
  for (const name of names) if (a[name] != null && text(a[name])) return a[name]
  const lower = new Map(Object.keys(a).map(k => [k.toLowerCase(), k]))
  for (const name of names) { const k = lower.get(name.toLowerCase()); if (k && a[k] != null && text(a[k])) return a[k] }
  return null
}
function cleanAppNo(v: any) { return text(v).toUpperCase().replace(/\s+/g,'').replace(/^PLANNING[:\s-]*/,'') }
function normalizeAuthority(v:any) { return text(v).toUpperCase().replace(/COUNTY COUNCIL|CITY COUNCIL|CITY AND COUNTY COUNCIL|COUNCIL|LOCAL AUTHORITY/g,'').replace(/[^A-Z0-9]/g,'').replace(/^CO/, '') }
function titleCase(s: string) { return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) }
function containsAny(s: string, xs: string[]) { return xs.some(x => s.includes(x)) }

const CATEGORY_RULES: Array<[string,string[]]> = [
  ['Building Materials',['dwelling','house','houses','extension','construction','building','garage','renovation','alterations','warehouse','school','apartments','units']],
  ['Timber',['dwelling','house','extension','roof','timber','garage']],
  ['Insulation',['dwelling','house','extension','renovation','retrofit','apartment','commercial']],
  ['Plumbing',['dwelling','house','extension','bathroom','toilet','sanitary','commercial','school','hotel','apartments']],
  ['Heating',['dwelling','house','extension','heat pump','heating','commercial','school','hotel','apartments']],
  ['Bathrooms & Sanitaryware',['dwelling','house','extension','bathroom','hotel','apartments','units']],
  ['Drainage & Civils',['dwelling','house','development','drainage','wastewater','septic','treatment system','site works','housing']],
  ['Roofing',['dwelling','house','extension','roof','garage','warehouse']],
  ['Hardware & Fixings',['dwelling','house','extension','construction','building','garage','warehouse','school']],
  ['Landscaping',['dwelling','house','development','landscaping','paving','boundary','site works']]
]

export function classifyPlanning(a: AnyRow): Classification {
  const desc = text(pick(a,'DevelopmentDescription','development_description','description','Description')).toLowerCase()
  const type = text(pick(a,'ApplicationType','application_type')).toLowerCase()
  const decision = text(pick(a,'Decision','decision')).toLowerCase()
  const status = text(pick(a,'ApplicationStatus','application_status')).toLowerCase()
  const units = int(pick(a,'NumResidentialUnits','ResidentialUnits','residential_units')) || 0
  const floor = number(pick(a,'FloorArea','floor_area')) || 0
  const oneOff = bool(pick(a,'OneOffHouse','OneOffKPI','one_off_house')) === true
  const blob = `${desc} ${type}`

  const hardIgnore = ['advertisement','signage','sign ','telecommunications','telecom','mast','antenna']
  const refused = containsAny(`${decision} ${status}`, ['refus','invalid','withdrawn'])
  // Retention applications regularise works already carried out without permission - the
  // construction already happened, so there's no future materials sale here regardless of
  // whether the description mentions "extension" or "construction" (it's describing what was
  // already built). Previously only a "retention with no construction words" was excluded, which
  // let ordinary retention-of-an-extension applications through as if they were prospective work.
  const isRetention = type.includes('retention') || desc.includes('retention of') || desc.includes('retention permission')
  const isChangeOfUseOnly = desc.includes('change of use') && !containsAny(desc,['extension','construction','extend','alteration','alterations'])
  // Checked before the one-off-house heuristic below: an extension/alteration application can
  // have NumResidentialUnits recorded as 1 by some local authorities (the same field-quality
  // issue behind other odd zero/one values in this dataset), which previously meant "extension
  // to dwelling house" could get misread as a brand-new one-off house.
  const extensionSignal = containsAny(blob,['extension','extend existing','rear extension','side extension','storey extension','alteration','alterations to','porch'])
  const explicitNewDwelling = containsAny(blob,['one off house','one-off house','single dwelling','single house','new dwelling','construct a dwelling','construction of a house','construction of a dwelling','erection of a dwelling','erect a dwelling','erection of one dwelling'])
  let project = 'other', base = 25
  if (oneOff || explicitNewDwelling || (units===1 && !extensionSignal && containsAny(blob,['house','dwelling']))) { project='one_off_house'; base=78 }
  else if (units >= 2 || containsAny(blob,['housing development','residential development','apartments','apartment block','dwellings','houses'])) { project='housing_development'; base=80 + Math.min(15, Math.floor(units/5)) }
  else if (extensionSignal) { project='extension'; base=60 }
  else if (containsAny(blob,['warehouse','industrial','commercial','retail','shop','office','hotel','school','creche','community centre'])) { project='commercial'; base=65 }
  else if (containsAny(blob,['agricultural','farm building','slatted shed','cattle','machinery shed'])) { project='agricultural'; base=62 }
  else if (containsAny(blob,['renovation','refurbishment','alterations','retrofit'])) { project='renovation'; base=55 }
  else if (containsAny(blob,['garage','shed','outbuilding'])) { project='ancillary'; base=42 }

  if (floor >= 250) base += 8; else if (floor >= 150) base += 5
  if (units >= 10) base += 10; else if (units >= 2) base += 5
  if (containsAny(desc,['wastewater treatment','septic tank','drainage','site works'])) base += 4
  if (containsAny(desc,['heat pump','underfloor heating','heating system'])) base += 5

  let stage = 'watch'
  if (refused) stage = decision.includes('withdraw') || status.includes('withdraw') ? 'withdrawn' : 'refused'
  else if (containsAny(`${decision} ${status}`, ['grant','conditional','permission granted','approved'])) { stage='granted'; base += 8 }
  else if (containsAny(status,['expired'])) stage='expired'

  const ignored = containsAny(blob, hardIgnore) || isRetention || isChangeOfUseOnly || refused || project === 'other' && base < 30
  if (ignored) base = Math.min(base, 15)
  const categories = ignored ? [] : CATEGORY_RULES.filter(([,words]) => words.some(w=>blob.includes(w))).map(([c])=>c)
  if (!categories.length && !ignored) categories.push('General Merchant')

  let low:number|null=null, high:number|null=null, band:string|null=null
  if (project==='one_off_house') { low=35000; high=90000; band='Medium' }
  else if (project==='housing_development') { const u=Math.max(2,units||2); low=u*25000; high=u*65000; band=u>=10?'Very High':u>=5?'High':'Medium' }
  else if (project==='extension') { low=8000; high=35000; band='Low' }
  else if (project==='commercial') { low=20000; high=150000; band='High' }
  else if (project==='agricultural') { low=10000; high=70000; band='Medium' }
  else if (project==='renovation') { low=8000; high=50000; band='Medium' }
  else if (project==='ancillary') { low=3000; high=18000; band='Low' }
  const reason = `${titleCase(project.replaceAll('_',' '))}; ${units ? `${units} residential unit${units===1?'':'s'}; `:''}${floor ? `${Math.round(floor)}m² recorded; `:''}${stage==='granted'?'permission appears granted; ':''}${ignored?'low merchant relevance':''}`.replace(/; $/,'')
  return { project_type:project, relevance_score:Math.max(0,Math.min(100,base)), categories, ignored, low, high, band, reason, stage }
}

function normalizeFeature(feature: AnyRow) {
  const a = feature.attributes || feature
  const c = classifyPlanning(a)
  const geometry = feature.geometry || {}
  const applicant = [pick(a,'ApplicantForename','ApplicantFirstName'),pick(a,'ApplicantSurname','ApplicantLastName')].map(text).filter(Boolean).join(' ') || text(pick(a,'ApplicantName','applicant_name')) || null
  const appNo = cleanAppNo(pick(a,'ApplicationNumber','PlanningApplicationNumber','application_number'))
  const auth = text(pick(a,'PlanningAuthority','LocalAuthority','planning_authority')) || null
  const oid = Number(pick(a,'OBJECTID','ObjectId','FID','source_object_id'))
  if (!Number.isFinite(oid)) throw new Error('Planning feature has no numeric OBJECTID')
  const lat = number(pick(a,'Latitude','LAT','lat')) ?? number(geometry.y)
  const lon = number(pick(a,'Longitude','LNG','lng')) ?? number(geometry.x)
  const direct = text(pick(a,'LinkAppDetails','ApplicationLink','ApplicationURL','Link','URL','source_url')).replace('http://www.eplanning.ie','https://www.eplanning.ie')
  return {
    source_object_id: oid,
    planning_authority: auth,
    planning_authority_normalized: normalizeAuthority(auth),
    application_number: appNo || null,
    application_number_normalized: appNo ? normalizePlanningRef(appNo) : null,
    development_description: text(pick(a,'DevelopmentDescription','Description')) || null,
    development_address: text(pick(a,'DevelopmentAddress','Address')) || null,
    development_postcode: text(pick(a,'DevelopmentPostcode','Postcode','Eircode')) || null,
    application_status: text(pick(a,'ApplicationStatus','Status')) || null,
    application_type: text(pick(a,'ApplicationType','Type')) || null,
    decision: text(pick(a,'Decision')) || null,
    project_stage: c.stage,
    applicant_name: applicant,
    applicant_address: text(pick(a,'ApplicantAddress')) || null,
    agent_name: text(pick(a,'AgentName','PlanningAgentName')) || null,
    agent_company: text(pick(a,'AgentCompany','PlanningAgentCompany')) || null,
    site_area: number(pick(a,'AreaofSite','SiteArea')),
    floor_area: number(pick(a,'FloorArea')),
    residential_units: int(pick(a,'NumResidentialUnits','ResidentialUnits')),
    one_off_house: bool(pick(a,'OneOffHouse')),
    received_date: dateIso(pick(a,'ReceivedDate','ApplicationReceivedDate')),
    decision_date: dateIso(pick(a,'DecisionDate')),
    grant_date: dateIso(pick(a,'GrantDate','DateGranted')),
    expiry_date: dateIso(pick(a,'ExpiryDate')),
    latitude: lat,
    longitude: lon,
    source_url: direct || (appNo ? `https://planning.localgov.ie/en/search/application?query=${encodeURIComponent(appNo)}` : 'https://planning.localgov.ie/en/search/application'),
    project_type: c.project_type,
    relevance_score: c.relevance_score,
    categories: c.categories,
    estimated_opportunity_low: c.low,
    estimated_opportunity_high: c.high,
    estimated_opportunity_band: c.band,
    score_reason: c.reason,
    ignored: c.ignored,
    last_seen_at: new Date().toISOString(),
    raw_source: a
  }
}

async function fetchArcgisPage(offset:number, where='1=1', orderByFields='ReceivedDate DESC') {
  const p = new URLSearchParams({
    f:'json', where, outFields:'*', returnGeometry:'true', outSR:'4326',
    orderByFields, resultOffset:String(offset), resultRecordCount:String(PAGE_SIZE)
  })
  const r = await fetch(`${ARCGIS_LAYER}/query?${p}`, { headers:{'User-Agent':'TenderFinder-Planning/1.0'}, cache:'no-store' })
  if (!r.ok) throw new Error(`Planning API ${r.status}`)
  const j = await r.json()
  if (j.error) throw new Error(`Planning API: ${j.error.message || JSON.stringify(j.error)}`)
  return (j.features || []) as AnyRow[]
}

function normalizePlanningRef(v:any) { return cleanAppNo(v).replace(/[\-\/\\.]/g,'') }

async function fetchRecentCommencements(days=120) {
  const fields = ['CN_Number','CN_Planning_Permission_Number','CN_Commencement_Date','CN_Project_Status','CN_Validation_Status','CN_Project_Name','CN_Description_proposed_development','CN_LAT','CN_LNG','CN_Street','CN_Town','CN_Eircode','CN_County','LocalAuthority','CN_Total_Number_of_Dwelling_Units','CN_Units_for_phase']
  const safeDays = Math.max(14,Math.min(365,days))
  const sql = `SELECT ${fields.map(f=>`"${f}"`).join(',')} FROM "${BCMS_RESOURCE_ID}" WHERE "CN_Commencement_Date" >= CURRENT_DATE - INTERVAL '${safeDays} days' ORDER BY "CN_Commencement_Date" DESC LIMIT 10000`
  const r = await fetch(`${BCMS_API}?${new URLSearchParams({sql})}`, { cache:'no-store', headers:{'User-Agent':'TenderFinder-Planning/1.0'} })
  if (!r.ok) throw new Error(`BCMS API ${r.status}`)
  const j = await r.json()
  if (!j.success) throw new Error(`BCMS API failed: ${j.error?.message || 'unknown error'}`)
  return (j.result?.records || []) as AnyRow[]
}

export async function matchCommencements() {
  const admin = createAdminClient()
  const rows = await fetchRecentCommencements(Number(process.env.BCMS_LOOKBACK_DAYS || 120))
  const refRows = rows.map(c=>({ row:c, ref:normalizePlanningRef(c.CN_Planning_Permission_Number), authority:normalizeAuthority(c.LocalAuthority) })).filter(x=>x.ref)
  const refs = Array.from(new Set(refRows.map(x=>x.ref)))
  const candidates = new Map<string, any[]>()
  for (let i=0;i<refs.length;i+=120) {
    const chunk=refs.slice(i,i+120)
    const {data,error}=await admin.from('planning_applications').select('id,application_number_normalized,planning_authority_normalized,relevance_score').in('application_number_normalized',chunk)
    if (error) throw error
    for (const p of data||[]) {
      if (!p.application_number_normalized) continue
      const list=candidates.get(p.application_number_normalized)||[]; list.push(p); candidates.set(p.application_number_normalized,list)
    }
  }
  // BCMS is ordered newest-first. Keep the newest notice per matched planning project.
  const chosen = new Map<string,{row:AnyRow,hit:any}>()
  for (const x of refRows) {
    const list=candidates.get(x.ref)||[]
    const exact=list.find(p=>x.authority && p.planning_authority_normalized===x.authority)
    const hit=exact || (list.length===1 ? list[0] : null)
    if (hit && !chosen.has(hit.id)) chosen.set(hit.id,{row:x.row,hit})
  }
  let matched=0
  const today=new Date().toISOString().slice(0,10)
  for (const {row:c,hit} of chosen.values()) {
    const commencementDate = dateIso(c.CN_Commencement_Date)?.slice(0,10) || null
    const stage=commencementDate && commencementDate>=today ? 'starting_soon' : 'active'
    const {error} = await admin.from('planning_applications').update({
      commencement_number:text(c.CN_Number)||null,
      commencement_date:commencementDate,
      commencement_status:text(c.CN_Project_Status || c.CN_Validation_Status)||null,
      commencement_source_url:'https://www.nbco.localgov.ie/en/bcms',
      commencement_matched_at:new Date().toISOString(),
      project_stage:stage,
      relevance_score:Math.min(100,Number(hit.relevance_score||0)+12)
    }).eq('id',hit.id)
    if (!error) matched++
  }
  return { checked:rows.length, matched }
}
export async function runPlanningIngestion(mode:'scheduled'|'full'|'pending'='scheduled') {
  const admin=createAdminClient(); const started=new Date().toISOString()
  const {data:run}=await admin.from('planning_ingest_runs').insert({started_at:started,mode}).select('id').single()
  const runId=run?.id; let fetched=0,inserted=0,updated=0,relevant=0,ignored=0,pages=0; const errors:string[]=[]
  try {
    // 'scheduled'/'full' sweep the newest-received applications, which is right for catching new
    // notices but structurally can't reach an application stuck awaiting a decision once enough
    // newer applications have pushed it past the page window - "received -> further information
    // requested -> decision months later" would otherwise quietly stop being refreshed. 'pending'
    // targets exactly that gap: every application with no grant date yet, regardless of how long
    // ago it was received (bounded by PENDING_LOOKBACK_DAYS so this can't grow unbounded forever).
    const maxPages = mode==='full'?FULL_PAGES : mode==='pending'?PENDING_PAGES : NORMAL_PAGES
    const where = mode==='pending' ? `GrantDate IS NULL AND ReceivedDate >= CURRENT_TIMESTAMP - INTERVAL '${PENDING_LOOKBACK_DAYS}' DAY` : '1=1'
    const orderByFields = mode==='pending' ? 'ReceivedDate ASC' : 'ReceivedDate DESC'
    for(let p=0;p<maxPages;p++) {
      try {
        const features=await fetchArcgisPage(p*PAGE_SIZE, where, orderByFields); pages++
        if (!features.length) break
        fetched += features.length
        const rows:any[]=[]
        for (const f of features) {
          try { const x=normalizeFeature(f); rows.push(x); x.ignored?ignored++:relevant++ } catch(e:any){ errors.push(`feature: ${e.message}`) }
        }
        if (rows.length) {
          const ids=rows.map(r=>r.source_object_id)
          const {data:existing}=await admin.from('planning_applications').select('source_object_id,commencement_date,project_stage,relevance_score').in('source_object_id',ids)
          const existingMap=new Map((existing||[]).map((x:any)=>[Number(x.source_object_id),x]))
          const existingSet=new Set(existingMap.keys())
          for (const row of rows) { const old:any=existingMap.get(row.source_object_id); if (old?.commencement_date) { row.project_stage=old.project_stage; row.relevance_score=Math.max(row.relevance_score,Number(old.relevance_score||0)) } }
          inserted += rows.filter(r=>!existingSet.has(r.source_object_id)).length
          updated += rows.filter(r=>existingSet.has(r.source_object_id)).length
          const {error}=await admin.from('planning_applications').upsert(rows,{onConflict:'source_object_id'})
          if(error) throw error
        }
        if(features.length<PAGE_SIZE) break
      } catch(e:any) { errors.push(`page ${p+1}: ${e.message}`); if(p===0) throw e }
    }
    // BCMS matching only needs to run on the 'scheduled'/'full' sweeps - a 'pending' sweep is
    // purely about catching decision changes on old applications, not discovering new ones.
    let cm={checked:0,matched:0}
    if (mode!=='pending') { try { cm=await matchCommencements() } catch(e:any) { errors.push(`BCMS: ${e.message}`) } }
    if(runId) await admin.from('planning_ingest_runs').update({finished_at:new Date().toISOString(),fetched,inserted,updated,relevant,ignored,pages_scanned:pages,commencements_checked:cm.checked,commencements_matched:cm.matched,errors}).eq('id',runId)
    return {fetched,inserted,updated,relevant,ignored,pages,commencements:cm,errors}
  } catch(e:any) {
    errors.push(e.message)
    if(runId) await admin.from('planning_ingest_runs').update({finished_at:new Date().toISOString(),fetched,inserted,updated,relevant,ignored,pages_scanned:pages,errors}).eq('id',runId)
    throw e
  }
}

export function distanceKm(lat1:number,lon1:number,lat2:number,lon2:number) {
  const R=6371, rad=(n:number)=>n*Math.PI/180
  const dLat=rad(lat2-lat1), dLon=rad(lon2-lon1)
  const a=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))
}
