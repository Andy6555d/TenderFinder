import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { logout } from '@/app/logout-action'
import SubmitButton from '@/components/SubmitButton'

export default async function Page() {
  const s = createClient()
  const { data: { user } } = await s.auth.getUser()
  if (!user) redirect('/login')
  const { data: p } = await s.from('profiles').select('status,outlet_name').eq('id', user.id).maybeSingle()
  if (p?.status === 'approved') redirect('/dashboard')

  // Accounts are approved automatically on signup, so landing here means either the account was
  // suspended by an admin, or the signup trigger hasn't finished yet - the copy covers both.
  return (
    <div className="wrap">
      <div className="notice-page">
        <div className="status-icon">i</div>
        <h1>Account not active</h1>
        <p>
          The account for <strong>{p?.outlet_name || 'your outlet'}</strong> isn't currently active.
          If you just signed up, try refreshing in a moment. Otherwise, your access may have been
          paused — contact your administrator if you believe this is a mistake.
        </p>
        <form action={logout}><SubmitButton className="btn btn-secondary" pendingLabel="Logging out…">Log out</SubmitButton></form>
      </div>
    </div>
  )
}
