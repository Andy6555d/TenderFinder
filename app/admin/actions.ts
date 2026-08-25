'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { reclassifyStoredTenders, runFastFullRefresh, runIngestion } from '@/lib/etenders'
import { runPlanningIngestion, matchCommencements } from '@/lib/planning'

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

export async function fastFullRefresh() {
  await requireAdmin()
  await runFastFullRefresh()
  revalidatePath('/admin')
  revalidatePath('/dashboard')
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

export async function refreshPlanning() { await requireAdmin(); await runPlanningIngestion('scheduled'); revalidatePath('/admin'); revalidatePath('/planning'); revalidatePath('/opportunities') }
export async function fullPlanningRefresh() { await requireAdmin(); await runPlanningIngestion('full'); revalidatePath('/admin'); revalidatePath('/planning'); revalidatePath('/opportunities') }
export async function pendingPlanningRefresh() { await requireAdmin(); await runPlanningIngestion('pending'); revalidatePath('/admin'); revalidatePath('/planning'); revalidatePath('/opportunities') }
export async function refreshCommencements() { await requireAdmin(); await matchCommencements(); revalidatePath('/admin'); revalidatePath('/planning'); revalidatePath('/opportunities') }
