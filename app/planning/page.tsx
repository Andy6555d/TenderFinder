import { requireMember } from '@/lib/auth'
import PlanningCard from '@/components/PlanningCard'
import type { PlanningLead } from '@/lib/types'
import { distanceKm } from '@/lib/planning'

const LIVE_STAGES = ['watch','granted','starting_soon','active']

export default async function Page({searchParams}:{searchParams:{q?:string;stage?:string;type?:string;min?:string;radius?:string;sort?:string}}){
  const {supabase,profile}=await requireMember()
  const min=Number(searchParams.min||profile.min_relevance_score||20)
  const hasBranch=profile.branch_latitude!=null&&profile.branch_longitude!=null
  const radius=Number(searchParams.radius||profile.planning_radius_km||30)
  const stages = searchParams.stage ? [searchParams.stage] : LIVE_STAGES
  const sort = searchParams.sort || 'smart'

  // The radius filter and sort now happen inside the database (nearby_planning_leads), before
  // any row limit is applied - a national cap can no longer discard a genuinely nearby lead just
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
    {!hasBranch&&<div className="notice-box"><b>Set your branch location for local leads.</b> Until then this page shows national results. Go to <a href="/preferences">Alerts & branch</a> and enter your address, it's located automatically. If you've already entered one and are still seeing this, the address may be too vague to resolve, try adding your county, or use "Use my current location" while at the branch instead.</div>}
    <form className="filterbar planning-filters" method="get"><input type="search" name="q" defaultValue={searchParams.q||''} placeholder="Search address, description or planning ref…"/><select name="stage" defaultValue={searchParams.stage||''}><option value="">Live stages</option><option value="starting_soon">Starting soon</option><option value="granted">Granted</option><option value="watch">Watch / pending</option><option value="active">Active</option></select><select name="type" defaultValue={searchParams.type||''}><option value="">All project types</option><option value="one_off_house">One-off house</option><option value="housing_development">Housing development</option><option value="extension">Extension</option><option value="commercial">Commercial</option><option value="agricultural">Agricultural</option><option value="renovation">Renovation</option><option value="ancillary">Garage / ancillary</option></select>{hasBranch&&<select name="radius" defaultValue={String(radius)}><option value="10">10 km</option><option value="20">20 km</option><option value="30">30 km</option><option value="50">50 km</option><option value="75">75 km</option><option value="100">100 km</option></select>}<select name="sort" defaultValue={sort}><option value="smart">Best opportunities</option><option value="score">Highest score</option>{hasBranch&&<option value="distance">Nearest first</option>}</select><button className="btn btn-secondary">Filter</button></form>
    {error&&<div className="error-box">{error.message}</div>}<div className="tender-list">{leads.map(l=><PlanningCard key={l.id} lead={l}/>)}</div>{!leads.length&&<div className="empty">No planning leads match these filters.</div>}
  </div>
}
