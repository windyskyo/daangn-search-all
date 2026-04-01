import { NextRequest } from 'next/server'
import { REGION_IDS } from '@/lib/regions'
import { getCookies } from '@/lib/cookieStore'

const BASE = 'https://www.daangn.com'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// 서버 사이드 병렬 배치 크기 (브라우저 15개 → 서버 100개)
const SERVER_BATCH = 100

interface Article {
  title?: string
  price?: number
  thumbnail?: string
  images?: string[]
  href?: string
  status?: string
}

async function fetchRegion(
  id: number,
  query: string,
  cookies: string,
): Promise<{ regionName: string; articles: Article[] }> {
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
  if (cookies) headers['Cookie'] = cookies

  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return { regionName: '', articles: [] }
    const data = await res.json()
    const regionName: string = (data?.region?.name as string) ?? ''
    const articles: Article[] = (
      (data?.allPage?.fleamarketArticles as Article[]) ?? []
    ).filter((a) => a.status !== 'Closed')
    return { regionName, articles }
  } catch {
    return { regionName: '', articles: [] }
  }
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q') ?? ''
  if (!query) return new Response('q 파라미터 필요', { status: 400 })

  const cookies = getCookies()
  const encoder = new TextEncoder()

  // 쿼리 변형 생성: 원본 + 공백 제거 (유사도 검색)
  const noSpaceQuery = query.replace(/\s+/g, '')
  const queries = noSpaceQuery !== query ? [query, noSpaceQuery] : [query]

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
        } catch { /* 클라이언트 연결 종료 */ }
      }

      // href 기준 전역 중복 제거
      const globalSeen = new Set<string>()
      let done = 0

      send({ total: REGION_IDS.length })

      try {
        for (let i = 0; i < REGION_IDS.length; i += SERVER_BATCH) {
          if (req.signal.aborted) break
          const batch = REGION_IDS.slice(i, i + SERVER_BATCH)

          await Promise.all(
            batch.map(async (id) => {
              // 쿼리 변형들을 동시에 요청
              const results = await Promise.all(
                queries.map((q) => fetchRegion(id, q, cookies)),
              )

              // 지역 내 중복 제거 후 전역 중복 확인
              const regionArticles: Article[] = []
              let regionName = ''
              const localSeen = new Set<string>()

              for (const r of results) {
                if (r.regionName) regionName = r.regionName
                for (const a of r.articles) {
                  const key = String(a.href || a.title || '')
                  if (!key) continue
                  if (localSeen.has(key)) continue
                  localSeen.add(key)
                  if (globalSeen.has(key)) continue
                  globalSeen.add(key)
                  regionArticles.push(a)
                }
              }

              done++
              if (regionArticles.length > 0) {
                send({ region: regionName, articles: regionArticles })
              }
            }),
          )

          send({ progress: done })
        }
      } catch { /* aborted */ }

      send({ done: true })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
