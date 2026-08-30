import { requireMember } from '@/lib/auth'
import PlanningCard from '@/components/PlanningCard'
import SubmitButton from '@/components/SubmitButton'
import type { PlanningLead } from '@/lib/types'
import { distanceKm } from '@/lib/planning'
import { IRISH_COUNTIES } from '@/lib/irish-counties'
import { setPlanningLocation } from './actions'

const LIVE_STAGES = ['watch','granted','starting_soon','active']

export default async function Page({searchParams}:{searchParams:{q?:string;stage?:string;type?:string;sort?:string}}){
  const {supabase,profile}=await requireMember()
  const min=Number(profile.min_relevance_score||20)
  const hasBranch=profile.branch_latitude!=null&&profile.branch_longitude!=null
  const radius=Number(profile.planning_radius_km||30)
  const stages = searchParams.stage ? [searchParams.stage] : LIVE_STAGES
  const sort = searchParams.sort || 'smart'

  // The radius filter and sort happen inside the database (nearby_planning_leads), before any
  // row limit is applied - a national cap can no longer discard a genuinely nearby lead just
  // because more recently-dated leads elsewhere in the country filled the limit first.
  const {data,error}=await supabase.rpc('nearby_planning_leads',{
    p_lat: hasBranch ? Number(profile.branch_latitude) : null,
    p_lon: hasBranch ? Number(profile.branch_longitude) : null,
    p_radius_km: radius,
    p_min_score: min,
    p_stages: stages,
    p_search: searchParams.q || null,
    p_type: searchParams.type || null,
    p_sort: sort,
    p_limit: 300
  })

  const leads=(data||[]).map((x:any)=>({
    ...x,
    distance_km: hasBranch && x.latitude!=null && x.longitude!=null
      ? Number(distanceKm(Number(profile.branch_latitude),Number(profile.branch_longitude),Number(x.latitude),Number(x.longitude)).toFixed(1))
      : null
  })) as PlanningLead[]

  return <div className="wrap page"><div className="page-head"><div><h1>Planning & Construction</h1><p className="sub">Private construction opportunities from Irish planning and commencement data.</p></div><div className="count">{leads.length} showing</div></div>

    <div className="panel" style={{marginBottom:16}}>
      <form action={setPlanningLocation} className="field-row" style={{alignItems:'end'}}>
        <div className="field"><label>Your county</label><select name="county" defaultValue={profile.branch_address||''}><option value="">Choose a county…</option>{IRISH_COUNTIES.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</select></div>
        <div className="field"><label>Search radius</label><select name="radius" defaultValue={String(radius)}><option value="10">10 km</option><option value="20">20 km</option><option value="30">30 km</option><option value="50">50 km</option><option value="75">75 km</option><option value="100">100 km</option></select></div>
        <SubmitButton className="btn btn-primary" pendingLabel="Saving…">Set location</SubmitButton>
      </form>
      <p className="muted" style={{marginTop:10,marginBottom:0}}>This sets where "nearby" means for both this page and your email alerts. County-level, not an exact address, a good balance of simple and accurate enough for a radius search.</p>
    </div>

    {!hasBranch&&<div className="notice-box"><b>Choose a county above to see local leads.</b> Until then this page shows national results.</div>}
    <form className="filterbar" method="get"><input type="search" name="q" defaultValue={searchParams.q||''} placeholder="Search address, description or planning ref…"/><select name="stage" defaultValue={searchParams.stage||''}><option value="">Live stages</option><option value="starting_soon">Starting soon</option><option value="granted">Granted</option><option value="watch">Watch / pending</option><option value="active">Active</option></select><select name="type" defaultValue={searchParams.type||''}><option value="">All project types</option><option value="one_off_house">One-off house</option><option value="housing_development">Housing development</option><option value="extension">Extension</option><option value="commercial">Commercial</option><option value="agricultural">Agricultural</option><option value="renovation">Renovation</option><option value="ancillary">Garage / ancillary</option></select><select name="sort" defaultValue={sort}><option value="smart">Best opportunities</option><option value="score">Highest score</option>{hasBranch&&<option value="distance">Nearest first</option>}</select><button className="btn btn-secondary">Filter</button></form>
    {error&&<div className="error-box">{error.message}</div>}<div className="tender-list">{leads.map(l=><PlanningCard key={l.id} lead={l}/>)}</div>{!leads.length&&<div className="empty">No planning leads match these filters.</div>}
  </div>
}
