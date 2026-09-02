import Link from 'next/link'
import type { Tender } from '@/lib/types'
import { NEW_WITHIN_HOURS, CLOSING_SOON_DAYS } from '@/lib/constants'

function euro(v: number | null) {
  return v == null ? 'Value not stated' : new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}
function date(v: string | null) {
  return v ? new Intl.DateTimeFormat('en-IE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v)) : 'Not stated'
}

export default function TenderCard({ t }: { t: Tender }) {
  const isNew = Date.now() - new Date(t.first_seen_at).getTime() < NEW_WITHIN_HOURS * 60 * 60 * 1000
  const daysToDeadline = t.deadline_at ? (new Date(t.deadline_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24) : null
  const closingSoon = daysToDeadline !== null && daysToDeadline >= 0 && daysToDeadline <= CLOSING_SOON_DAYS

  return (
    <article className="tender-card">
      <div className="score"><span>{t.relevance_score}</span><small>match</small></div>
      <div className="tender-main">
        <div className="tender-top">
          <span className="badge green">SUPPLY ONLY</span>
          {isNew && <span className="badge new">NEW</span>}
          {closingSoon && <span className="badge soon">CLOSING SOON</span>}
          {t.categories?.slice(0, 3).map(c => <span className="badge" key={c}>{c}</span>)}
        </div>
        <h2><Link href={`/tenders/${t.id}`}>{t.title}</Link></h2>
        <p className="authority">{t.authority || 'Contracting authority not parsed'}</p>
        <p className="desc">{t.description?.slice(0, 240) || 'Open the opportunity for full public notice details.'}</p>
        <div className="facts">
          <span className={closingSoon ? 'soon' : undefined}><b>Deadline</b>{date(t.deadline_at)}</span>
          <span><b>Estimated value</b>{euro(t.estimated_value)}</span>
          <span><b>Procedure</b>{t.procedure || '—'}</span>
        </div>
      </div>
    </article>
  )
}
