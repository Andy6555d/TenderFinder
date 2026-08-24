'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { geocodeIrishAddress } from '@/lib/geocode'

export async function login(formData: FormData) {
  const supabase = createClient()
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`)
  redirect('/opportunities')
}
export async function signup(formData: FormData) {
  const supabase = createClient()
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')
  const outletName = String(formData.get('outlet_name') || '').trim()
  const contactName = String(formData.get('contact_name') || '').trim()
  if (!email || password.length < 8 || !outletName) redirect('/signup?error=Please+complete+all+required+fields')
  const { data, error } = await supabase.auth.signUp({ email, password, options:{ data:{ outlet_name:outletName, contact_name:contactName } } })
  if (error) redirect(`/signup?error=${encodeURIComponent(error.message)}`)
  if (data.user) await supabase.from('profiles').upsert({ id:data.user.id, email, outlet_name:outletName, contact_name:contactName, status:'pending' })
  redirect('/pending')
}
export async function logout() { const supabase=createClient(); await supabase.auth.signOut(); redirect('/login') }
export async function savePreferences(formData: FormData) {
  const supabase=createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect('/login')
  const categories=formData.getAll('categories').map(String)
  const notifyEmail=formData.get('notify_email')==='on'
  const notifyPlanning=formData.get('notify_planning')==='on'
  const minScore=Math.max(0,Math.min(100,Number(formData.get('min_relevance_score')||20)))
  const num=(name:string)=>{ const raw=String(formData.get(name)||'').trim(); if(!raw)return null; const n=Number(raw); return Number.isFinite(n)?n:null }
  const branchAddress=String(formData.get('branch_address')||'').trim()
  const branchEircode=String(formData.get('branch_eircode')||'').trim()
  let branchLatitude=num('branch_latitude')
  let branchLongitude=num('branch_longitude')
  // Nobody actually knows their own lat/lon. If the member gave an address but no coordinates,
  // resolve it automatically rather than silently leaving the branch unlocated - an unlocated
  // branch means the distance filter on /planning never runs at all, showing leads nationwide.
  if (branchLatitude==null && branchLongitude==null && (branchAddress||branchEircode)) {
    const found = await geocodeIrishAddress(branchAddress, branchEircode)
    if (found) { branchLatitude=found.latitude; branchLongitude=found.longitude }
  }
  const { error } = await supabase.rpc('update_my_opportunity_preferences', {
    p_categories: categories, p_notify_email: notifyEmail, p_min_relevance_score: minScore,
    p_branch_address:branchAddress, p_branch_eircode:branchEircode,
    p_branch_latitude:branchLatitude, p_branch_longitude:branchLongitude,
    p_planning_radius_km:Math.max(5,Math.min(100,Number(formData.get('planning_radius_km')||30))), p_notify_planning:notifyPlanning
  })
  if (error) throw new Error(`${error.message}. Have you run supabase-migration-v7-planning-leads.sql?`)
  revalidatePath('/preferences'); revalidatePath('/dashboard'); revalidatePath('/planning'); revalidatePath('/opportunities')
}
export async function saveTender(tenderId:string) {
  const supabase=createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) return
  await supabase.from('saved_tenders').upsert({user_id:user.id,tender_id:tenderId},{onConflict:'user_id,tender_id'})
  revalidatePath('/saved'); revalidatePath(`/tenders/${tenderId}`)
}
export async function unsaveTender(tenderId:string) {
  const supabase=createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) return
  await supabase.from('saved_tenders').delete().eq('user_id',user.id).eq('tender_id',tenderId)
  revalidatePath('/saved'); revalidatePath(`/tenders/${tenderId}`)
}
