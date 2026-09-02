import { NextRequest, NextResponse } from 'next/server'
import { syncUnitedHubOpportunities } from '@/lib/united-hub'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 300
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const full = req.nextUrl.searchParams.get('full') === '1'
    const sync = await syncUnitedHubOpportunities({ full })
    return NextResponse.json({ ok: true, sync })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
