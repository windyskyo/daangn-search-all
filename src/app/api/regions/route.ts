import { NextResponse } from 'next/server'
import { REGION_IDS } from '@/lib/regions'

export async function GET() {
  return NextResponse.json({ ids: REGION_IDS, count: REGION_IDS.length })
}
