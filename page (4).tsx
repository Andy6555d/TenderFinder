import { requireMember } from '@/lib/auth'
import { uploadDocument, deleteDocument } from './actions'
import SubmitButton from '@/components/SubmitButton'

const SUGGESTED_LABELS = [
  'Tax Clearance Certificate',
  'eESPD',
  'Public Liability Insurance',
  "Employer's Liability Insurance",
  'CRO / Company Registration',
  'RBO Confirmation',
  'Trade References'
]

function formatBytes(n: number | null) {
  if (!n) return ''
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default async function Page() {
  const { supabase, user } = await requireMember()
  const { data } = await supabase
    .from('member_documents')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  const documents = data || []

  // Signed URLs are short-lived and generated per request for this member only - the bucket
  // itself is private, so there's no way to reach these files without one.
  const withUrls = await Promise.all(
    documents.map(async (doc: any) => {
      const { data: signed } = await supabase.storage.from('member-documents').createSignedUrl(doc.file_path, 300)
      return { ...doc, url: signed?.signedUrl || null }
    })
  )

  const today = new Date()
  const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  return (
    <div className="wrap page max700">
      <div className="page-head">
        <div>
          <h1>Your documents</h1>
          <p className="sub">Keep your standard supporting documents here so they're always ready when you need them for a submission. Private to your account only.</p>
        </div>
      </div>

      <div className="panel section-title">
        <h2>Upload a document</h2>
        <p className="muted">Common ones worth keeping on file: {SUGGESTED_LABELS.join(', ')}.</p>
        <form action={uploadDocument} className="field-row">
          <div className="field">
            <label>Label *</label>
            <input name="label" list="suggested-labels" placeholder="e.g. Tax Clearance Certificate" required />
            <datalist id="suggested-labels">
              {SUGGESTED_LABELS.map(l => <option key={l} value={l} />)}
            </datalist>
          </div>
          <div className="field">
            <label>Expiry date (optional)</label>
            <input name="expires_at" type="date" />
          </div>
          <div className="field">
            <label>File *</label>
            <input name="file" type="file" accept=".pdf,.doc,.docx" required />
          </div>
          <SubmitButton className="btn btn-primary" pendingLabel="Uploading…" doneLabel="Uploaded">Upload</SubmitButton>
        </form>
      </div>

      <div className="panel section-title">
        <h2>Stored documents</h2>
        {!withUrls.length && <div className="empty">Nothing uploaded yet.</div>}
        {!!withUrls.length && (
          <div className="doc-list">
            {withUrls.map((doc: any) => {
              const expires = doc.expires_at ? new Date(doc.expires_at) : null
              const expired = expires && expires < today
              const expiringSoon = expires && !expired && expires <= in30
              return (
                <div className="doc-row" key={doc.id}>
                  <div className="doc-info">
                    <strong>{doc.label}</strong>
                    {expired && <span className="badge soon">EXPIRED</span>}
                    {expiringSoon && <span className="badge new">RENEW SOON</span>}
                    <div className="muted">{doc.file_name} &middot; {formatBytes(doc.file_size)}{doc.expires_at ? ` · Expires ${doc.expires_at}` : ''}</div>
                  </div>
                  <div className="doc-actions">
                    {doc.url && <a className="btn btn-ghost btn-sm" href={doc.url} target="_blank" rel="noreferrer">View</a>}
                    <form action={deleteDocument}>
                      <input type="hidden" name="id" value={doc.id} />
                      <SubmitButton className="btn btn-danger btn-sm" pendingLabel="Deleting…" doneLabel="Deleted">Delete</SubmitButton>
                    </form>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
