import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function requireMember() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || profile.status !== 'approved') redirect('/pending')
  return { supabase, user, profile }
}

export async function requireAdmin() {
  const ctx = await requireMember()
  if (!ctx.profile.is_admin) redirect('/dashboard')
  return ctx
}
