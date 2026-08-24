import { requireAdmin } from '@/lib/auth'
import {
  approveMember, suspendMember, ingestNow, fastFullRefresh, reclassifyAll,
  approveTender, rejectTender, clearTenderOverride
} from './actions'

// Fast Full Refresh is engineered to complete inside normal serverless limits, but this allows
// longer execution on Vercel plans that support it. Lower-plan platform caps still take precedence.
export const maxDuration = 300

export default async function Page() {
  const { supabase } = await requireAdmin()
  const [{ data: profiles }, { data: runs }, { data: review }, { data: state }] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    supabase.from('ingest_runs').select('*').order('started_at', { ascending: false }).limit(12),
    supabase.from('tenders')
      .select('id,title,authority,relevance_score,supply_only_status,supply_only_reason,admin_override,source_url,categories,classifier_version')
      .eq('status', 'open')
      .or('supply_only_status.eq.mixed,admin_override.neq.none')
      .order('relevance_score', { ascending: false })
      .limit(100),
    supabase.from('ingestion_state').select('*').eq('key', 'live_backfill').maybeSingle()
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
          <form action={fastFullRefresh}><button className="btn btn-primary">Fast full refresh</button></form>
          <form action={ingestNow}><button className="btn btn-secondary">Check newest now</button></form>
          <form action={reclassifyAll}><button className="btn btn-ghost">Reclassify stored tenders</button></form>
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

      <h2 className="section-title">Members</h2>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Outlet</th><th>Email</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {(profiles || []).map((p: any) => <tr key={p.id}><td>{p.outlet_name}{p.is_admin && <span className="badge">ADMIN</span>}</td><td>{p.email}</td><td>{p.status}</td><td>{p.status !== 'approved' ? <form action={approveMember.bind(null, p.id)}><button className="btn btn-sm btn-primary">Approve</button></form> : !p.is_admin ? <form action={suspendMember.bind(null, p.id)}><button className="btn btn-sm btn-danger">Suspend</button></form> : null}</td></tr>)}
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
            <form action={approveTender.bind(null, t.id)}><button className="btn btn-sm btn-primary">Approve</button></form>
            <form action={rejectTender.bind(null, t.id)}><button className="btn btn-sm btn-danger">Reject</button></form>
            {t.admin_override !== 'none' && <form action={clearTenderOverride.bind(null, t.id)}><button className="btn btn-sm btn-ghost">Auto</button></form>}
          </div></td>
        </tr>)}
      </tbody></table></div>
    </div>
  )
}
