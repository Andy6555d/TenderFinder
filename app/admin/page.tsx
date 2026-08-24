import { requireAdmin } from '@/lib/auth'
import {
  approveMember, suspendMember, ingestNow, restartBackfill, reclassifyAll,
  approveTender, rejectTender, clearTenderOverride
} from './actions'

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

  return (
    <div className="wrap page">
      <div className="page-head">
        <div>
          <h1>Admin</h1>
          <p className="sub">Member approval, complete-live-catalogue backfill, ingestion health and tender review.</p>
        </div>
        <div className="row-actions">
          <form action={ingestNow}><button className="btn btn-primary">Run scan now</button></form>
          <form action={reclassifyAll}><button className="btn btn-secondary">Reclassify stored tenders</button></form>
          <form action={restartBackfill}><button className="btn btn-ghost">Restart full backfill</button></form>
        </div>
      </div>

      <section className="panel">
        <h3>Full live-catalogue backfill</h3>
        <div className="summary-strip">
          <div><small>Next page</small><strong>{state?.next_page ?? 1}</strong></div>
          <div><small>eTenders live count</small><strong>{state?.reported_live_count ?? '—'}</strong></div>
          <div><small>Status</small><strong>{state?.complete ? 'Complete' : 'Running'}</strong></div>
        </div>
        <p className="muted">The hourly job checks the newest notices immediately and separately walks every page of the currently-live eTenders catalogue. The page cursor advances only after a full page is safely processed/skipped.</p>
        {state?.last_error && <div className="error-box">{state.last_error}</div>}
      </section>

      <h2 className="section-title">Members</h2>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Outlet</th><th>Email</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {(profiles || []).map((p: any) => <tr key={p.id}><td>{p.outlet_name}{p.is_admin && <span className="badge">ADMIN</span>}</td><td>{p.email}</td><td>{p.status}</td><td>{p.status !== 'approved' ? <form action={approveMember.bind(null, p.id)}><button className="btn btn-sm btn-primary">Approve</button></form> : !p.is_admin ? <form action={suspendMember.bind(null, p.id)}><button className="btn btn-sm btn-danger">Suspend</button></form> : null}</td></tr>)}
      </tbody></table></div>

      <h2 className="section-title">Ingestion runs</h2>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Started</th><th>Live count</th><th>Found</th><th>New</th><th>Existing skipped</th><th>Refreshed</th><th>Eligible</th><th>Mixed</th><th>Backfill pages</th><th>Cursor</th><th>Failed</th></tr></thead><tbody>
        {(runs || []).map((r: any) => <tr key={r.id}>
          <td>{new Date(r.started_at).toLocaleString('en-IE')}</td><td>{r.reported_live_count ?? '—'}</td><td>{r.discovered}</td><td>{r.inserted}</td><td>{r.skipped_existing ?? 0}</td><td>{r.refreshed ?? 0}</td><td>{r.eligible}</td><td>{r.mixed}</td><td>{r.pages_scanned ?? 0}</td><td>{r.cursor_start ?? '—'} → {r.cursor_end ?? '—'}</td><td>{r.failed}</td>
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
