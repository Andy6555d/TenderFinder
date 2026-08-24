import Link from 'next/link'
import { signup } from '@/app/actions'

export default function Page({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="wrap">
      <div className="auth-shell">
        <h1>Create your account</h1>
        <p className="sub">Free for member outlets — you'll have access to supply-only tender opportunities right away.</p>
        {searchParams.error && <div className="error-box">{searchParams.error}</div>}
        <form action={signup}>
          <div className="field"><label>Outlet / company *</label><input name="outlet_name" required /></div>
          <div className="field"><label>Your name</label><input name="contact_name" /></div>
          <div className="field"><label>Email *</label><input name="email" type="email" required /></div>
          <div className="field"><label>Password *</label><input name="password" type="password" minLength={8} required /></div>
          <button className="btn btn-primary btn-full">Create account</button>
        </form>
        <div className="auth-switch">Already have an account? <Link href="/login">Log in</Link></div>
      </div>
    </div>
  )
}
