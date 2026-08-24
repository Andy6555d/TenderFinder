import { createAdminClient } from '@/lib/supabase/admin'

export async function sendTenderAlerts() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: 0, skipped: 'RESEND_API_KEY not configured' }
  const admin = createAdminClient()
  const since = new Date(Date.now() - 75 * 60 * 1000).toISOString()
  const { data: tenders } = await admin.from('tenders').select('*').eq('supply_only_status','eligible').eq('status','open').gte('first_seen_at', since).gte('relevance_score', 20)
  const { data: profiles } = await admin.from('profiles').select('id,email,outlet_name,categories,notify_email,min_relevance_score').eq('status','approved').eq('notify_email', true)
  let sent = 0
  for (const p of profiles || []) {
    const matches = (tenders || []).filter(t => t.relevance_score >= (p.min_relevance_score || 20) && (!p.categories?.length || t.categories?.some((c:string) => p.categories.includes(c))))
    if (!matches.length) continue
    const rows = matches.slice(0,10).map(t => `<li><strong>${escapeHtml(t.title)}</strong> — ${escapeHtml(t.authority || '')} — score ${t.relevance_score}/100<br><a href="${process.env.NEXT_PUBLIC_SITE_URL}/tenders/${t.id}">Open summary</a></li>`).join('')
    const res = await fetch('https://api.resend.com/emails', { method:'POST', headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'}, body:JSON.stringify({ from: process.env.ALERT_FROM_EMAIL, to:[p.email], subject:`${matches.length} new supply tender${matches.length===1?'':'s'} matched`, html:`<p>Hello ${escapeHtml(p.outlet_name || '')},</p><p>New eTenders supply opportunities matched your merchant categories:</p><ul>${rows}</ul><p>These are automated leads. Always verify the official notice and tender documents on eTenders before bidding.</p>` }) })
    if (res.ok) sent++
  }
  return { sent }
}
function escapeHtml(s:string){return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]||c))}
