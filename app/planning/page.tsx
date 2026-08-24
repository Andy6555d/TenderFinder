import { requireMember } from '@/lib/auth'
import PlanningCard from '@/components/PlanningCard'
import type { PlanningLead } from '@/lib/types'
import { distanceKm } from '@/lib/planning'

export default async function Page({searchParams}:{searchParams:{q?:string;stage?:string;type?:string;min?:string;radius?:string;sort?:string}}){
  const {supabase,profile}=await requireMember(); const min=Number(searchParams.min||profile.min_relevance_score||20)
  let q=supabase.from('planning_applications').select('*').gte('relevance_score',min).eq('ignored',false)
  if(searchParams.q) q=q.or(`development_description.ilike.%${searchParams.q}%,development_address.ilike.%${searchParams.q}%,application_number.ilike.%${searchParams.q}%,planning_authority.ilike.%${searchParams.q}%`)
  if(searchParams.stage) q=q.eq('project_stage',searchParams.stage)
  else q=q.in('project_stage',['watch','granted','starting_soon','active'])
  if(searchParams.type) q=q.eq('project_type',searchParams.type)
  q=searchParams.sort==='score'?q.order('relevance_score',{ascending:false}).limit(300):q.order('commencement_date',{ascending:false,nullsFirst:false}).order('grant_date',{ascending:false,nullsFirst:false}).order('received_date',{ascending:false,nullsFirst:false}).limit(300)
  const {data,error}=await q
  const hasBranch=profile.branch_latitude!=null&&profile.branch_longitude!=null
  const radius=Number(searchParams.radius||profile.planning_radius_km||30)
  let leads=(data||[]).map((x:any)=>{
    const dist=hasBranch&&x.latitude!=null&&x.longitude!=null?distanceKm(Number(profile.branch_latitude),Number(profile.branch_longitude),Number(x.latitude),Number(x.longitude)):null
    return {...x,distance_km:dist} as PlanningLead
  })
  if(hasBranch) leads=leads.filter(x=>x.distance_km==null||x.distance_km<=radius).sort((a,b)=>{
    if(searchParams.sort==='distance') return (a.distance_km??9999)-(b.distance_km??9999)
    if(a.project_stage==='starting_soon'&&b.project_stage!=='starting_soon')return -1
    if(b.project_stage==='starting_soon'&&a.project_stage!=='starting_soon')return 1
    return b.relevance_score-a.relevance_score
  })
  return <div className="wrap page"><div className="page-head"><div><h1>Planning & Construction</h1><p className="sub">Private construction opportunities from Irish planning and commencement data.</p></div><div className="count">{leads.length} showing</div></div>
    {!hasBranch&&<div className="notice-box"><b>Set your branch location for local leads.</b> Until then this page shows national results. Go to <a href="/preferences">Alerts & branch</a> and use your branch coordinates/location.</div>}
    <form className="filterbar planning-filters" method="get"><input type="search" name="q" defaultValue={searchParams.q||''} placeholder="Search address, description or planning ref…"/><select name="stage" defaultValue={searchParams.stage||''}><option value="">Live stages</option><option value="starting_soon">Starting soon</option><option value="granted">Granted</option><option value="watch">Watch / pending</option><option value="active">Active</option></select><select name="type" defaultValue={searchParams.type||''}><option value="">All project types</option><option value="one_off_house">One-off house</option><option value="housing_development">Housing development</option><option value="extension">Extension</option><option value="commercial">Commercial</option><option value="agricultural">Agricultural</option><option value="renovation">Renovation</option><option value="ancillary">Garage / ancillary</option></select>{hasBranch&&<select name="radius" defaultValue={String(radius)}><option value="10">10 km</option><option value="20">20 km</option><option value="30">30 km</option><option value="50">50 km</option><option value="75">75 km</option><option value="100">100 km</option></select>}<select name="sort" defaultValue={searchParams.sort||'smart'}><option value="smart">Best opportunities</option><option value="score">Highest score</option>{hasBranch&&<option value="distance">Nearest first</option>}</select><button className="btn btn-secondary">Filter</button></form>
    {error&&<div className="error-box">{error.message}</div>}<div className="tender-list">{leads.map(l=><PlanningCard key={l.id} lead={l}/>)}</div>{!leads.length&&<div className="empty">No planning leads match these filters.</div>}
  </div>
}
