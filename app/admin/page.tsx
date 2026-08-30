import { requireAdmin } from '@/lib/auth'
import SubmitButton from '@/components/SubmitButton'
import {
  approveMember, suspendMember, ingestNow, fastFullRefresh, reclassifyAll,
  approveTender, rejectTender, clearTenderOverride, refreshPlanning, fullPlanningRefresh, pendingPlanningRefresh, refreshCommencements
} from './actions'

// Fast Full Refresh is engineered to complete inside normal serverless limits, but this allows
// longer execution on Vercel plans that support it. Lower-plan platform caps still take precedence.
export const maxDuration = 300

export default async function Page() {
  const { supabase } = await requireAdmin()
  const [{ data: profiles }, { data: runs }, { data: review }, { data: state }, { data: planningRuns }, { count: planningCount }, { count: startingCount }] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    supabase.from('ingest_runs').select('*').order('started_at', { ascending: false }).limit(12),
    supabase.from('tenders')
      .select('id,title,authority,relevance_score,supply_only_status,supply_only_reason,admin_override,source_url,categories,classifier_version')
      .eq('status', 'open')
      .or('supply_only_status.eq.mixed,admin_override.neq.none')
      .order('relevance_score', { ascending: false })
      .limit(100),
    supabase.from('ingestion_state').select('*').eq('key', 'live_backfill').maybeSingle(),
    supabase.from('planning_ingest_runs').select('*').order('started_at', { ascending: false }).limit(10),
    supabase.from('planning_applications').select('*', { count: 'exact', head: true }).eq('ignored', false),
    supabase.from('planning_applications').select('*', { count: 'exact', head: true }).eq('project_stage', 'starting_soon').eq('ignored', false)
  ])
  const latestFast = (runs || []).find((r: any) => r.mode === 'fast_full')

  return (
    <div className="wrap page">
      <div className="page-head">
        <div>
          <h1>Admin</h1>
          <p className="sub">Member approval, fast live-catalogue indexing, ingestion health and tender review.</p>
        </div>
        <div className="row-actions">
          <form action={fastFullRefresh}><SubmitButton className="btn btn-primary" pendingLabel="Refreshing…" doneLabel="Done">Fast full refresh</SubmitButton></form>
          <form action={ingestNow}><SubmitButton className="btn btn-secondary" pendingLabel="Checking…" doneLabel="Done">Check newest now</SubmitButton></form>
          <form action={reclassifyAll}><SubmitButton className="btn btn-ghost" pendingLabel="Reclassifying…" doneLabel="Done">Reclassify stored tenders</SubmitButton></form>
        </div>
      </div>

      <section className="panel">
        <h3>Fast live-catalogue index</h3>
        <div className="summary-strip">
          <div><small>eTenders live count</small><strong>{state?.reported_live_count ?? latestFast?.reported_live_count ?? '—'}</strong></div>
          <div><small>Catalogue status</small><strong>{state?.complete ? 'Indexed' : 'Not fully indexed'}</strong></div>
          <div><small>Latest candidates</small><strong>{latestFast?.candidates ?? '—'}</strong></div>
        </div>
        <p className="muted">Fast full refresh reads all current eTenders search-result pages in parallel, pre-filters them using merchant relevance, then opens only plausible merchant candidates for full Procurement Type, CPV and supply-only analysis. It replaces the old days-long page-by-page backfill.</p>
        {state?.last_error && <div className="error-box">{state.last_error}</div>}
      </section>


      <h2 className="section-title">Planning & Construction engine</h2>
      <section className="panel">
        <div className="summary-strip"><div><small>Relevant planning leads</small><strong>{planningCount ?? '—'}</strong></div><div><small>Starting soon</small><strong>{startingCount ?? '—'}</strong></div><div><small>Latest planning scan</small><strong>{planningRuns?.[0]?.fetched ?? '—'}</strong></div></div>
        <div className="row-actions"><form action={refreshPlanning}><SubmitButton className="btn btn-primary" pendingLabel="Checking…" doneLabel="Done">Check newest planning</SubmitButton></form><form action={fullPlanningRefresh}><SubmitButton className="btn btn-secondary" pendingLabel="Refreshing…" doneLabel="Done">Planning full refresh</SubmitButton></form><form action={pendingPlanningRefresh}><SubmitButton className="btn btn-secondary" pendingLabel="Refreshing…" doneLabel="Done">Refresh pending decisions</SubmitButton></form><form action={refreshCommencements}><SubmitButton className="btn btn-ghost" pendingLabel="Matching…" doneLabel="Done">Match commencements</SubmitButton></form></div>
        <p className="muted">"Refresh pending decisions" re-checks every application still awaiting a grant, regardless of how long ago it was received - this is what catches an application that's been sitting through a "further information requested" delay for months, which the newest-first scans above can't reach once it falls out of their window.</p>
        <p className="muted">The planning engine is independent of eTenders. Normal scans read the newest ArcGIS pages and then match recent BCMS commencement notices by normalized planning reference. Full refresh reads a larger recent slice; it does not download the entire national historical archive.</p>
      </section>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Started</th><th>Mode</th><th>Fetched</th><th>New</th><th>Updated</th><th>Relevant</th><th>Ignored</th><th>Pages</th><th>BCMS checked</th><th>Matched</th></tr></thead><tbody>{(planningRuns || []).map((r:any)=><tr key={r.id}><td>{new Date(r.started_at).toLocaleString('en-IE')}</td><td>{r.mode}</td><td>{r.fetched}</td><td>{r.inserted}</td><td>{r.updated}</td><td>{r.relevant}</td><td>{r.ignored}</td><td>{r.pages_scanned}</td><td>{r.commencements_checked}</td><td>{r.commencements_matched}</td></tr>)}</tbody></table></div>

      <h2 className="section-title">Members</h2>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Outlet</th><th>Email</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {(profiles || []).map((p: any) => <tr key={p.id}><td>{p.outlet_name}{p.is_admin && <span className="badge">ADMIN</span>}</td><td>{p.email}</td><td>{p.status}</td><td>{p.status !== 'approved' ? <form action={approveMember.bind(null, p.id)}><SubmitButton className="btn btn-sm btn-primary" pendingLabel="Approving…" doneLabel="Approved">Approve</SubmitButton></form> : !p.is_admin ? <form action={suspendMember.bind(null, p.id)}><SubmitButton className="btn btn-sm btn-danger" pendingLabel="Suspending…" doneLabel="Suspended">Suspend</SubmitButton></form> : null}</td></tr>)}
      </tbody></table></div>

      <h2 className="section-title">Ingestion runs</h2>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Started</th><th>Mode</th><th>Live count</th><th>Catalogue found</th><th>Candidates</th><th>New</th><th>Updated</th><th>Eligible</th><th>Mixed</th><th>Pages</th><th>Failed</th></tr></thead><tbody>
        {(runs || []).map((r: any) => <tr key={r.id}>
          <td>{new Date(r.started_at).toLocaleString('en-IE')}</td><td>{r.mode}</td><td>{r.reported_live_count ?? '—'}</td><td>{r.discovered}</td><td>{r.candidates ?? 0}</td><td>{r.inserted}</td><td>{r.updated}</td><td>{r.eligible}</td><td>{r.mixed}</td><td>{r.pages_scanned ?? 0}</td><td>{r.failed}</td>
        </tr>)}
      </tbody></table></div>

      <h2 className="section-title">Review / overrides</h2>
      <p className="muted">Mixed tenders are hidden from members until approved. A manual decision persists through later rescans. Use Reject for a false positive that should never appear.</p>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Tender</th><th>Score</th><th>Auto classification</th><th>Override</th><th>Action</th></tr></thead><tbody>
        {(review || []).map((t: any) => <tr key={t.id}>
          <td><a href={t.source_url} target="_blank" rel="noreferrer">{t.title}</a><br/><small>{t.authority}</small><br/><small>{(t.categories || []).join(' · ')}</small></td>
          <td>{t.relevance_score}</td>
          <td><b>{t.supply_only_status}</b><br/><small>{t.supply_only_reason}</small><br/><small>{t.classifier_version}</small></td>
          <td>{t.admin_override}</td>
          <td><div className="row-actions">
            <form action={approveTender.bind(null, t.id)}><SubmitButton className="btn btn-sm btn-primary" pendingLabel="Approving…" doneLabel="Approved">Approve</SubmitButton></form>
            <form action={rejectTender.bind(null, t.id)}><SubmitButton className="btn btn-sm btn-danger" pendingLabel="Rejecting…" doneLabel="Rejected">Reject</SubmitButton></form>
            {t.admin_override !== 'none' && <form action={clearTenderOverride.bind(null, t.id)}><SubmitButton className="btn btn-sm btn-ghost" pendingLabel="Resetting…" doneLabel="Reset">Auto</SubmitButton></form>}
          </div></td>
        </tr>)}
      </tbody></table></div>
    </div>
  )
}
