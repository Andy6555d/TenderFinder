'use server'
import { revalidatePath } from 'next/cache'
import { requireMember } from '@/lib/auth'

const MAX_BYTES = 15 * 1024 * 1024 // 15MB - generous for a PDF or Word doc, not for accidental video uploads

export async function uploadDocument(formData: FormData) {
  const { supabase, user } = await requireMember()
  const file = formData.get('file') as File | null
  const label = String(formData.get('label') || '').trim()
  const expiresAtRaw = String(formData.get('expires_at') || '').trim()

  if (!file || !file.size) throw new Error('Choose a file to upload.')
  if (!label) throw new Error('Give the document a label.')
  if (file.size > MAX_BYTES) throw new Error('That file is larger than 15MB. Try a compressed PDF.')

  // Path is "{user_id}/{timestamp}-{filename}" - the leading user_id segment is what the storage
  // RLS policy checks against auth.uid(), so this member can only ever write into their own folder.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${user.id}/${Date.now()}-${safeName}`

  const { error: uploadError } = await supabase.storage.from('member-documents').upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false
  })
  if (uploadError) throw new Error(uploadError.message)

  const { error: insertError } = await supabase.from('member_documents').insert({
    user_id: user.id,
    label,
    file_path: path,
    file_name: file.name,
    file_size: file.size,
    expires_at: expiresAtRaw || null
  })
  if (insertError) {
    // Clean up the orphaned file if the metadata write failed, so a partial upload doesn't sit
    // around invisibly taking up storage with no way to see or delete it from the UI.
    await supabase.storage.from('member-documents').remove([path])
    throw new Error(insertError.message)
  }

  revalidatePath('/documents')
}

export async function deleteDocument(formData: FormData) {
  const { supabase, user } = await requireMember()
  const id = String(formData.get('id'))
  const { data: doc, error: readError } = await supabase.from('member_documents').select('file_path').eq('id', id).eq('user_id', user.id).single()
  if (readError || !doc) throw new Error(readError?.message || 'Document not found.')

  const { error: removeError } = await supabase.storage.from('member-documents').remove([doc.file_path])
  if (removeError) throw new Error(removeError.message)

  const { error: deleteError } = await supabase.from('member_documents').delete().eq('id', id).eq('user_id', user.id)
  if (deleteError) throw new Error(deleteError.message)

  revalidatePath('/documents')
}
