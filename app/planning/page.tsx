import { requireMember } from '@/lib/auth'
import PlanningCard from '@/components/PlanningCard'
import { IRISH_COUNTIES, authorityPatternsFor } from '@/lib/irish-counties'

const LIVE_STAGES = ['watch','granted','starting_soon','active']

export default async function Page({searchParams}:{searchParams:{q?:string;county?:string;stage?:string;type?:string;min?:string;sort?:string}}){
  const {supabase}=await requireMember()
  // Default shows every score - only filters when the member actually picks a threshold from
  // the dropdown below, rather than pre-filtering before they've seen what's out there.
  const min=Number(searchParams.min||0)
  const stages = searchParams.stage ? [searchParams.stage] : LIVE_STAGES
  const sort = searchParams.sort || 'smart'

  // Plain categorical filtering only - no coordinates, no distance math, no geolocation of any
  // kind. County is matched as a text pattern against planning_authority.
  let q = supabase.from('planning_applications').select('*')
    .eq('ignored', false)
    .gte('relevance_score', min)
    .in('project_stage', stages)

  if (searchParams.q) q = q.or(`development_description.ilike.%${searchParams.q}%,development_address.ilike.%${searchParams.q}%,application_number.ilike.%${searchParams.q}%,planning_authority.ilike.%${searchParams.q}%`)
  if (searchParams.type) q = q.eq('project_type', searchParams.type)
  const authorityPatterns = authorityPatternsFor(searchParams.county)
  if (authorityPatterns) q = q.or(authorityPatterns.map(p => `planning_authority.ilike.%${p}%`).join(','))

  q = sort === 'score'
    ? q.order('relevance_score', { ascending: false }).limit(300)
    : q.order('project_stage', { ascending: true }).order('relevance_score', { ascending: false }).limit(300)

  const {data,error}=await q

  return <div className="wrap page"><div className="page-head"><div><h1>Planning & Construction</h1><p className="sub">Private construction opportunities from Irish planning and commencement data.</p></div><div className="count">{data?.length||0} showing</div></div>
    <form className="filterbar planning-filters" method="get"><input type="search" name="q" defaultValue={searchParams.q||''} placeholder="Search address, description or planning ref…"/><select name="county" defaultValue={searchParams.county||''}><option value="">All counties</option>{IRISH_COUNTIES.map(c=><option key={c} value={c}>{c}</option>)}</select><select name="stage" defaultValue={searchParams.stage||''}><option value="">Live stages</option><option value="starting_soon">Starting soon</option><option value="granted">Granted</option><option value="watch">Watch / pending</option><option value="active">Active</option></select><select name="type" defaultValue={searchParams.type||''}><option value="">All project types</option><option value="one_off_house">One-off house</option><option value="housing_development">Housing development</option><option value="extension">Extension</option><option value="commercial">Commercial</option><option value="agricultural">Agricultural</option><option value="renovation">Renovation</option><option value="ancillary">Garage / ancillary</option></select><select name="min" defaultValue={searchParams.min||'0'}><option value="0">All scores</option><option value="20">20+ match</option><option value="40">40+ match</option><option value="60">60+ match</option><option value="80">80+ match</option></select><select name="sort" defaultValue={sort}><option value="smart">Best opportunities</option><option value="score">Highest score</option></select><button className="btn btn-secondary">Filter</button></form>
    {error&&<div className="error-box">{error.message}</div>}<div className="tender-list">{(data||[]).map((l:any)=><PlanningCard key={l.id} lead={l}/>)}</div>{!data?.length&&<div className="empty">No planning leads match these filters.</div>}
  </div>
}
