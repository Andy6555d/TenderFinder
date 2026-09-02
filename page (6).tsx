import { requireMember } from '@/lib/auth'
import TenderCard from '@/components/TenderCard'
import { MEMBER_CATEGORIES } from '@/lib/constants'
import type { Tender } from '@/lib/types'

export default async function Page({ searchParams }: { searchParams: { q?: string; category?: string; min?: string; sort?: string } }) {
  const { supabase } = await requireMember()
  const nowIso = new Date().toISOString()
  // Defaults to showing everything - score is a filter members apply themselves via the
  // dropdown, not something hidden behind a default floor. The "0-19" band exists specifically
  // so a low score (which could be a genuine misclassification) is visible and checkable rather
  // than silently invisible.
  const min = searchParams.min ?? '0'

  let q = supabase
    .from('tenders')
    .select('*')
    .eq('status', 'open')
    .neq('admin_override', 'reject')
    .or('supply_only_status.eq.eligible,admin_override.eq.approve')
    // Guard against a stale 'open' status: a tender whose deadline has passed since it was last
    // scanned should never show as live here, even if the stored status hasn't caught up yet.
    .or(`deadline_at.is.null,deadline_at.gt.${nowIso}`)

  // "0-19" is a discrete band (score floor AND ceiling), everything else is a plain floor -
  // lets a member specifically isolate the weak/borderline matches (worth checking for a
  // misclassification) rather than only ever seeing them hidden below the usual 20+ default.
  if (min === '0-19') q = q.gte('relevance_score', 0).lte('relevance_score', 19)
  else q = q.gte('relevance_score', Number(min))

  if (searchParams.q) q = q.or(`title.ilike.%${searchParams.q}%,description.ilike.%${searchParams.q}%,authority.ilike.%${searchParams.q}%`)
  if (searchParams.category) q = q.contains('categories', [searchParams.category])

  const sort = searchParams.sort || 'recent'
  q = sort === 'deadline'
    ? q.order('deadline_at', { ascending: true, nullsFirst: false }).limit(100)
    : sort === 'score'
    ? q.order('relevance_score', { ascending: false }).limit(100)
    : q.order('published_at', { ascending: false, nullsFirst: false }).limit(100)

  const { data, error } = await q

  return (
    <div className="wrap page">
      <div className="page-head">
        <div>
          <h1>Supply opportunities</h1>
          <p className="sub">eTenders notices automatically filtered for merchant-relevant, supply-only contracts.</p>
        </div>
        <div className="count">{data?.length || 0} showing</div>
      </div>
      <form className="filterbar" method="get">
        <input type="search" name="q" defaultValue={searchParams.q || ''} placeholder="Search title, authority or description…" />
        <select name="category" defaultValue={searchParams.category || ''}>
          <option value="">All categories</option>
          {MEMBER_CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select name="min" defaultValue={min}>
          <option value="0">All scores</option>
          <option value="0-19">0-19 match</option>
          <option value="20">20+ match</option>
          <option value="40">40+ match</option>
          <option value="60">60+ match</option>
          <option value="80">80+ match</option>
        </select>
        <select name="sort" defaultValue={searchParams.sort || 'recent'}>
          <option value="recent">Newest first</option>
          <option value="score">Highest score</option>
          <option value="deadline">Closing soonest</option>
        </select>
        <button className="btn btn-secondary">Filter</button>
      </form>
      {error && <div className="error-box">{error.message}</div>}
      <div className="tender-list">
        {(data || []).map(t => <TenderCard key={t.id} t={t as Tender} />)}
      </div>
      {!data?.length && <div className="empty">No open supply opportunities match these filters.</div>}
    </div>
  )
}
