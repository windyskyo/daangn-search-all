import { NextRequest, NextResponse } from 'next/server'
import { setCookies } from '@/lib/cookieStore'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const cookies: string = typeof body.cookies === 'string' ? body.cookies.trim() : ''
  setCookies(cookies)
  return NextResponse.json({ ok: true })
}
