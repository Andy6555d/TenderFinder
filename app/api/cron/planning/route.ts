import { NextRequest, NextResponse } from 'next/server'
import { runPlanningIngestion } from '@/lib/planning'
import { sendPlanningAlerts } from '@/lib/alerts'
import { syncUnitedHubSource } from '@/lib/united-hub'
export const dynamic='force-dynamic'; export const revalidate=0; export const maxDuration=300
export async function GET(req:NextRequest){const secret=process.env.CRON_SECRET;const auth=req.headers.get('authorization');if(secret&&auth!==`Bearer ${secret}`)return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});try{const ingest=await runPlanningIngestion('scheduled');const alerts=await sendPlanningAlerts();const hubSync=await syncUnitedHubSource('planning',{since:new Date(Date.now()-48*60*60*1000).toISOString()});return NextResponse.json({ok:true,ingest,alerts,hubSync})}catch(e:any){return NextResponse.json({ok:false,error:e.message},{status:500})}}
