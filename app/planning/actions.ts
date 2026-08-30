'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { findCounty } from '@/lib/irish-counties'
export async function setPlanningLocation(formData:FormData){
  const s=createClient();const {data:{user}}=await s.auth.getUser();if(!user)return
  const county=String(formData.get('county')||'').trim()
  const radius=Math.max(5,Math.min(100,Number(formData.get('radius')||30)))
  const c=findCounty(county)
  const { error } = await s.rpc('set_my_planning_location',{p_county:c?.name||null,p_latitude:c?.lat??null,p_longitude:c?.lon??null,p_radius_km:radius})
  if (error) throw new Error(`${error.message}. Have you run supabase-migration-v10-county-picker.sql?`)
  revalidatePath('/planning'); revalidatePath('/opportunities'); redirect('/planning')
}
export async function savePlanningLead(id:string){const s=createClient();const {data:{user}}=await s.auth.getUser();if(!user)return;await s.from('saved_planning_leads').upsert({user_id:user.id,planning_id:id},{onConflict:'user_id,planning_id'});revalidatePath(`/planning/${id}`);revalidatePath('/saved')}
export async function unsavePlanningLead(id:string){const s=createClient();const {data:{user}}=await s.auth.getUser();if(!user)return;await s.from('saved_planning_leads').delete().eq('user_id',user.id).eq('planning_id',id);revalidatePath(`/planning/${id}`);revalidatePath('/saved')}
export async function addPlanningContact(id:string,formData:FormData){const s=createClient();const {data:{user}}=await s.auth.getUser();if(!user)return;const name=String(formData.get('name')||'').trim();if(!name)return;await s.from('planning_contacts').insert({user_id:user.id,planning_id:id,role:String(formData.get('role')||'builder'),name,company:String(formData.get('company')||'').trim()||null,phone:String(formData.get('phone')||'').trim()||null,email:String(formData.get('email')||'').trim()||null,notes:String(formData.get('notes')||'').trim()||null,source:String(formData.get('source')||'member')});revalidatePath(`/planning/${id}`)}
export async function deletePlanningContact(projectId:string,contactId:string){const s=createClient();const {data:{user}}=await s.auth.getUser();if(!user)return;await s.from('planning_contacts').delete().eq('id',contactId).eq('user_id',user.id);revalidatePath(`/planning/${projectId}`)}
