import { NextRequest, NextResponse } from 'next/server'
import { runIngestion } from '@/lib/etenders'
import { sendTenderAlerts } from '@/lib/alerts'
import { syncUnitedHubSource } from '@/lib/united-hub'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const ingest = await runIngestion()
    const alerts = await sendTenderAlerts()
    const hubSync = await syncUnitedHubSource('tender', { since: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() })
    return NextResponse.json({ ok: true, ingest, alerts, hubSync })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
