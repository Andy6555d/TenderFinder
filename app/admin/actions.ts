'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { reclassifyStoredTenders, resetBackfill, runIngestion } from '@/lib/etenders'

export async function approveMember(id: string) {
  await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ status: 'approved' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

export async function suspendMember(id: string) {
  await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ status: 'suspended' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

export async function ingestNow() {
  await requireAdmin()
  await runIngestion()
  revalidatePath('/admin')
  revalidatePath('/dashboard')
}

export async function restartBackfill() {
  await requireAdmin()
  await resetBackfill()
  revalidatePath('/admin')
}

export async function reclassifyAll() {
  await requireAdmin()
  await reclassifyStoredTenders()
  revalidatePath('/admin')
  revalidatePath('/dashboard')
}

export async function approveTender(id: string) {
  const { user } = await requireAdmin()
  const admin = createAdminClient()
  const { data: tender, error: readError } = await admin.from('tenders').select('relevance_score').eq('id', id).single()
  if (readError) throw new Error(readError.message)
  const { error } = await admin.from('tenders').update({
    admin_override: 'approve',
    admin_reviewed_at: new Date().toISOString(),
    admin_reviewed_by: user.id,
    relevance_score: Math.max(20, Number(tender?.relevance_score || 0))
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
  revalidatePath('/dashboard')
}

export async function rejectTender(id: string) {
  const { user } = await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('tenders').update({
    admin_override: 'reject',
    admin_reviewed_at: new Date().toISOString(),
    admin_reviewed_by: user.id
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
  revalidatePath('/dashboard')
}

export async function clearTenderOverride(id: string) {
  await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('tenders').update({
    admin_override: 'none',
    admin_review_note: null,
    admin_reviewed_at: null,
    admin_reviewed_by: null
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
  revalidatePath('/dashboard')
}
