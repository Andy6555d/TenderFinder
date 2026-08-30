import './globals.css'
import Link from 'next/link'
import { Newsreader, Inter, IBM_Plex_Mono } from 'next/font/google'



import { createClient } from '@/lib/supabase/server'
import { logout } from './actions'
import SubmitButton from '@/components/SubmitButton'

// Type system grounded in what this product actually is: official public records (eTenders,
// national planning, BCMS) turned into a usable register. Newsreader carries the "record of
// note" gravity for headings; Inter handles the dense tables and forms; IBM Plex Mono gives
// reference numbers (CPV codes, planning refs, resource IDs) a genuinely technical treatment
// instead of the browser default monospace.
const display = Newsreader({ subsets: ['latin'], weight: ['500', '600', '700'], style: ['normal', 'italic'], variable: '--font-display' })
const body = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-body' })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono' })

export const metadata = { title: 'UH Tender Finder', description: 'Public tender and construction opportunity intelligence for builders merchants.' }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser()
  let profile: any = null
  if (user) { const r = await supabase.from('profiles').select('outlet_name,is_admin,status').eq('id', user.id).maybeSingle(); profile = r.data }
  return <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}><body>
    <header><div className="wrap header-inner"><Link className="logo" href={profile?.status === 'approved' ? '/opportunities' : '/'}><span className="logo-mark">TF</span><span>UH Tender Finder</span></Link>
      {profile?.status === 'approved' && <><nav><Link href="/opportunities">Home</Link><Link href="/dashboard">eTenders</Link><Link href="/planning">Planning</Link><Link href="/saved">Saved</Link><Link href="/pricing">Pricing</Link><Link href="/documents">Documents</Link><Link href="/preferences">Alerts</Link><Link href="/guides">Help</Link>{profile?.is_admin && <Link href="/admin">Admin</Link>}</nav><div className="header-actions"><span className="nav-outlet">{profile.outlet_name}</span><form action={logout}><SubmitButton className="logout-btn" pendingLabel="Logging out…">Log out</SubmitButton></form></div></>}
    </div></header>
    <main>{children}</main>
    <footer>
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <span className="logo footer-logo"><span className="logo-mark">TF</span><span>UH Tender Finder</span></span>
          <p>Public tenders and construction opportunities, read from official registers and put in front of the merchants who can actually fill them.</p>
        </div>
        <nav className="footer-col" aria-label="Product">
          <b>Product</b>
          <Link href="/opportunities">Overview</Link>
          <Link href="/dashboard">eTenders</Link>
          <Link href="/planning">Planning &amp; Construction</Link>
          <Link href="/pricing">Pricing workspace</Link>
        </nav>
        <nav className="footer-col" aria-label="Resources">
          <b>Resources</b>
          <Link href="/guides">Help &amp; guides</Link>
          <Link href="/guides#documents">Standard documents</Link>
          <Link href="/guides#etenders">Using eTenders</Link>
        </nav>
        <nav className="footer-col" aria-label="Legal">
          <b>Legal</b>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
        </nav>
      </div>
      <div className="wrap footer-bottom">
        <span>&copy; {new Date().getFullYear()} UH Tender Finder. Not affiliated with, or an official publication of, any government body.</span>
        <span className="disclaimer">Opportunity summaries are automated aids only, always verify official records before acting. Planning data: Department of Housing / Irish Local Authorities, CC BY 4.0.</span>
      </div>
    </footer>
  </body></html>
}
