import { createAdminClient } from '@/lib/supabase/admin'
import { distanceKm } from '@/lib/planning'

export async function sendTenderAlerts() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: 0, skipped: 'RESEND_API_KEY not configured' }

  const admin = createAdminClient()
  const since = new Date(Date.now() - 75 * 60 * 1000).toISOString()
  // Fetch broadly and let each member's own min_relevance_score do the real filtering below -
  // matches the same fix applied to sendPlanningAlerts, so a lowered preference actually reaches alerts.
  const { data: tenders } = await admin.from('tenders').select('*').eq('status', 'open').neq('admin_override', 'reject').or('supply_only_status.eq.eligible,admin_override.eq.approve').gte('first_seen_at', since).gte('relevance_score', 1)
  const { data: profiles } = await admin.from('profiles').select('id,email,outlet_name,categories,notify_email,min_relevance_score').eq('status', 'approved').eq('notify_email', true)

  let sent = 0
  for (const p of profiles || []) {
    const matches = (tenders || []).filter(t => t.relevance_score >= (p.min_relevance_score || 20) && (!p.categories?.length || t.categories?.some((c: string) => p.categories.includes(c))))
    if (!matches.length) continue
    const rows = matches.slice(0, 10).map(t => `<li><strong>${escapeHtml(t.title)}</strong> — ${escapeHtml(t.authority || '')} — score ${t.relevance_score}/100<br><a href="${process.env.NEXT_PUBLIC_SITE_URL}/tenders/${t.id}">Open summary</a></li>`).join('')
    const res = await sendEmail(p.email, `${matches.length} new supply tender${matches.length === 1 ? '' : 's'} matched`, `<p>Hello ${escapeHtml(p.outlet_name || '')},</p><p>New eTenders supply opportunities matched your merchant categories:</p><ul>${rows}</ul><p>These are automated leads. Always verify the official notice and tender documents on eTenders before bidding.</p>`, apiKey)
    if (res.ok) sent++
  }
  return { sent }
}

export async function sendPlanningAlerts() {
  const apiKey=process.env.RESEND_API_KEY
  if(!apiKey) return {sent:0,skipped:'RESEND_API_KEY not configured'}
  const admin=createAdminClient()
  const {data:profiles}=await admin.from('profiles').select('id,email,outlet_name,categories,min_relevance_score,branch_latitude,branch_longitude,planning_radius_km,notify_planning').eq('status','approved').eq('notify_planning',true)
  let sent=0, delivered=0
  for(const p of profiles||[]){
    const {data:already}=await admin.from('planning_alert_deliveries').select('planning_id,alert_kind').eq('user_id',p.id)
    const done=new Set((already||[]).map((x:any)=>`${x.planning_id}:${x.alert_kind}`))
    const hasBranch=p.branch_latitude!=null&&p.branch_longitude!=null
    // Per-member RPC call: distance filtering happens inside the database before any limit is
    // applied, so a member's genuinely nearby lead can never be excluded by national volume -
    // this used to fetch a flat 2,500-row national pool first and filter distance afterward,
    // which silently missed leads once total relevant volume passed that cap (it regularly does).
    const {data:nearby}=await admin.rpc('nearby_planning_leads',{
      p_lat: hasBranch?Number(p.branch_latitude):null, p_lon: hasBranch?Number(p.branch_longitude):null,
      p_radius_km: Number(p.planning_radius_km||30), p_min_score: p.min_relevance_score||20,
      p_stages: ['watch','granted','starting_soon','active'], p_search: null, p_type: null, p_sort: 'score', p_limit: 50
    })
    const candidates=(nearby||[]).map((l:any)=>{
      const kind=l.commencement_matched_at?'commencement':'new'
      const dist=hasBranch&&l.latitude!=null&&l.longitude!=null?distanceKm(Number(p.branch_latitude),Number(p.branch_longitude),Number(l.latitude),Number(l.longitude)):null
      return {...l,_kind:kind,_distance:dist}
    }).filter((l:any)=>!done.has(`${l.id}:${l._kind}`) && (!p.categories?.length||l.categories?.some((c:string)=>p.categories.includes(c))))
      .sort((a:any,b:any)=>(a._kind==='commencement'?0:1)-(b._kind==='commencement'?0:1)||b.relevance_score-a.relevance_score)
      .slice(0,12)
    if(!candidates.length) continue
    const rows=candidates.map((l:any)=>`<li><strong>${escapeHtml(l.development_address||l.development_description?.slice(0,80)||'Planning lead')}</strong> — ${escapeHtml(l._kind==='commencement'?'commencement detected':l.project_stage.replaceAll('_',' '))} — score ${l.relevance_score}/100${l._distance!=null?` — ${l._distance.toFixed(1)} km away`:''}<br><a href="${process.env.NEXT_PUBLIC_SITE_URL}/planning/${l.id}">Open lead</a></li>`).join('')
    const res=await sendEmail(p.email,`${candidates.length} construction opportunit${candidates.length===1?'y':'ies'} matched`,`<p>Hello ${escapeHtml(p.outlet_name||'')},</p><p>New planning or commencement signals matched your branch:</p><ul>${rows}</ul><p>Planning categories and values are estimates. Verify the official planning/building-control record before acting.</p>`,apiKey)
    if(res.ok){sent++; const payload=candidates.map((l:any)=>({user_id:p.id,planning_id:l.id,alert_kind:l._kind,sent_at:new Date().toISOString()})); const {error}=await admin.from('planning_alert_deliveries').upsert(payload,{onConflict:'user_id,planning_id,alert_kind'}); if(!error)delivered+=payload.length}
  }
  return {sent,delivered}
}

async function sendEmail(to:string,subject:string,html:string,apiKey:string){return fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.ALERT_FROM_EMAIL,to:[to],subject,html})})}
function escapeHtml(s: string) { return String(s||'').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] || c)) }
