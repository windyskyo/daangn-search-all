import { NextRequest, NextResponse } from 'next/server'
import { getCookies } from '@/lib/cookieStore'

const BASE = 'https://www.daangn.com'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const query = searchParams.get('q')
  const id = searchParams.get('id')

  if (!query || !id) {
    return NextResponse.json({ error: 'q, id 파라미터가 필요합니다' }, { status: 400 })
  }

  const url =
    `${BASE}/kr/buy-sell/s/` +
    `?in=x-${id}` +
    `&search=${encodeURIComponent(query)}` +
    `&_data=routes%2Fkr.buy-sell.s`

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'User-Agent': UA,
  }

  const cookies = getCookies()
  if (cookies) {
    headers['Cookie'] = cookies
  }

  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(12_000),
    })

    if (!res.ok) {
      return NextResponse.json({ region: '', articles: [] })
    }

    const data = await res.json()
    const regionName: string = (data?.region?.name as string) ?? ''
    const rawArticles: Record<string, unknown>[] =
      (data?.allPage?.fleamarketArticles as Record<string, unknown>[]) ?? []

    const articles = rawArticles.filter((a) => a.status !== 'Closed')

    return NextResponse.json({ region: regionName, articles })
  } catch {
    return NextResponse.json({ region: '', articles: [] })
  }
}
