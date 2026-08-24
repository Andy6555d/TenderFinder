import Link from 'next/link'
import { requireMember } from '@/lib/auth'
export default async function Page(){
  const {supabase,profile}=await requireMember(); const now=new Date().toISOString()
  const [{count:tenders},{count:planning},{count:starting}] = await Promise.all([
    supabase.from('tenders').select('*',{count:'exact',head:true}).eq('status','open').neq('admin_override','reject').or('supply_only_status.eq.eligible,admin_override.eq.approve').or(`deadline_at.is.null,deadline_at.gt.${now}`),
    supabase.from('planning_applications').select('*',{count:'exact',head:true}).gte('relevance_score',profile.min_relevance_score||20).in('project_stage',['watch','granted','starting_soon','active']),
    supabase.from('planning_applications').select('*',{count:'exact',head:true}).gte('relevance_score',profile.min_relevance_score||20).eq('project_stage','starting_soon')
  ])
  return <div className="wrap page"><div className="page-head"><div><h1>Find opportunities</h1><p className="sub">Public tenders and private construction signals in one member tool.</p></div></div>
    <div className="source-grid">
      <Link href="/dashboard" className="source-card"><div className="source-icon">🏛</div><div><small>PUBLIC SECTOR</small><h2>eTenders</h2><p>Supply-only public contracts filtered for builders-merchant relevance.</p><strong>{tenders||0} live opportunities →</strong></div></Link>
      <Link href="/planning" className="source-card"><div className="source-icon">🏗</div><div><small>PRIVATE CONSTRUCTION</small><h2>Planning & Construction</h2><p>Granted planning applications and commencement signals near your branch.</p><strong>{planning||0} relevant · {starting||0} starting soon →</strong></div></Link>
    </div>
    <section className="panel explainer"><h2>Two lead engines, one place</h2><p><b>eTenders</b> tells you who is publicly buying now. <b>Planning & Construction</b> shows what is likely to be built next, then upgrades projects when a commencement notice is detected.</p></section>
  </div>
}
