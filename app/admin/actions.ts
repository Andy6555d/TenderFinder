'use server'
import { revalidatePath } from 'next/cache'; import { requireAdmin } from '@/lib/auth'; import { createAdminClient } from '@/lib/supabase/admin'; import { runIngestion } from '@/lib/etenders'
export async function approveMember(id:string){await requireAdmin();const admin=createAdminClient();const {error}=await admin.from('profiles').update({status:'approved'}).eq('id',id);if(error)throw new Error(error.message);revalidatePath('/admin')}
export async function suspendMember(id:string){await requireAdmin();const admin=createAdminClient();const {error}=await admin.from('profiles').update({status:'suspended'}).eq('id',id);if(error)throw new Error(error.message);revalidatePath('/admin')}
export async function ingestNow(){await requireAdmin();await runIngestion(30);revalidatePath('/admin');revalidatePath('/dashboard')}
