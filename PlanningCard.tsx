import Link from 'next/link'
import type { PlanningLead } from '@/lib/types'

function euro(v:number|null){return v==null?'—':new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(v)}
function d(v:string|null){return v?new Intl.DateTimeFormat('en-IE',{dateStyle:'medium'}).format(new Date(v)):'—'}
function projectLabel(v:string){return v.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}
export default function PlanningCard({lead}:{lead:PlanningLead}){
  const hot=lead.project_stage==='starting_soon'
  return <article className="tender-card planning-card">
    <div className="score"><span>{lead.relevance_score}</span><small>match</small></div>
    <div className="tender-main">
      <div className="tender-top">
        <span className={`badge ${hot?'soon':'green'}`}>{hot?'STARTING SOON':lead.project_stage.replaceAll('_',' ').toUpperCase()}</span>
        <span className="badge">{projectLabel(lead.project_type)}</span>
        {lead.categories?.slice(0,3).map(c=><span className="badge" key={c}>{c}</span>)}
      </div>
      <h2><Link href={`/planning/${lead.id}`}>{lead.development_address || lead.development_description?.slice(0,95) || 'Planning opportunity'}</Link></h2>
      <p className="authority">{lead.planning_authority || 'Planning authority'} · {lead.application_number || 'Reference unavailable'}</p>
      <p className="desc">{lead.development_description?.slice(0,260) || 'Open the lead for planning details.'}</p>
      <div className="facts">
        <span><b>{hot?'Commencement':'Granted'}</b>{hot?d(lead.commencement_date):d(lead.grant_date||lead.decision_date)}</span>
        <span><b>Opportunity scale</b>{lead.estimated_opportunity_band?`${lead.estimated_opportunity_band} (indicative ${euro(lead.estimated_opportunity_low)}–${euro(lead.estimated_opportunity_high)})`:'Not estimated'}</span>
        <span><b>Residential units</b>{lead.residential_units ?? (lead.one_off_house?1:'—')}</span>
      </div>
    </div>
  </article>
}
