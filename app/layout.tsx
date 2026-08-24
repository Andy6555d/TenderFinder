import './globals.css'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { logout } from './actions'

export const metadata = { title:'UH Tender Finder', description:'Public tender and construction opportunity intelligence for builders merchants.' }
export default async function RootLayout({children}:{children:React.ReactNode}) {
  const supabase=createClient(); const {data:{user}}=await supabase.auth.getUser()
  let profile:any=null
  if(user) { const r=await supabase.from('profiles').select('outlet_name,is_admin,status').eq('id',user.id).maybeSingle(); profile=r.data }
  return <html lang="en"><body>
    <header><div className="wrap header-inner"><Link className="logo" href={profile?.status==='approved'?'/opportunities':'/'}><span className="logo-mark">TF</span><span>UH Tender Finder</span></Link>
    {profile?.status==='approved' && <><nav><Link href="/opportunities">Home</Link><Link href="/dashboard">eTenders</Link><Link href="/planning">Planning</Link><Link href="/saved">Saved</Link><Link href="/pricing">Pricing</Link><Link href="/documents">Documents</Link><Link href="/preferences">Alerts</Link><Link href="/guides">Help</Link>{profile?.is_admin&&<Link href="/admin">Admin</Link>}</nav><div className="header-actions"><span className="nav-outlet">{profile.outlet_name}</span><form action={logout}><button className="logout-btn">Log out</button></form></div></>}</div></header>
    <main>{children}</main><footer><div className="wrap footer-inner"><div><strong>UH Tender Finder</strong><br/><span>Find public tenders and private construction opportunities in one member tool.</span></div><div className="disclaimer">Opportunity summaries are automated aids only. Always verify official records before acting. Planning data: Department of Housing / Irish Local Authorities, CC BY 4.0.</div></div></footer>
  </body></html>
}
