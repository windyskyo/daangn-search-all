'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface Article {
  title?: string
  price?: number
  thumbnail?: string
  images?: string[]
  href?: string
  status?: string
}

interface CardData extends Article {
  region: string
}

// 관련도 점수 계산
function scoreRelevance(title: string, query: string): number {
  const t = title.toLowerCase()
  const tNoSp = t.replace(/\s+/g, '')
  const q = query.toLowerCase()
  const qNoSp = q.replace(/\s+/g, '')
  const tokens = q.split(/\s+/).filter(Boolean)

  let score = 0
  if (t === q) score += 200
  if (tNoSp === qNoSp) score += 150
  if (t.startsWith(q)) score += 80
  if (tNoSp.startsWith(qNoSp)) score += 60
  if (t.includes(q)) score += 50
  if (tNoSp.includes(qNoSp)) score += 40

  let matched = 0
  for (const token of tokens) {
    if (t.includes(token)) matched++
    else if (tNoSp.includes(token.replace(/\s+/g, ''))) matched += 0.5
  }
  if (tokens.length > 0) score += (matched / tokens.length) * 30

  return score
}

const RENDER_INTERVAL_MS = 400

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [cookieStatus, setCookieStatus] = useState('미설정 (설정 시 더 많은 결과)')
  const [modalOpen, setModalOpen] = useState(false)
  const [cookieInput, setCookieInput] = useState('')
  const [savedBadge, setSavedBadge] = useState(false)
  const [copyLabel, setCopyLabel] = useState('복사')

  const [cards, setCards] = useState<CardData[]>([])
  const [searching, setSearching] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, found: 0 })
  const [showGuide, setShowGuide] = useState<'init' | 'empty' | false>('init')

  const bufferRef = useRef<CardData[]>([])
  const searchingRef = useRef(false)
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const lastRenderedRef = useRef(0)

  // 주기적으로 버퍼 → 상태 동기화 (렌더 최소화)
  useEffect(() => {
    if (!searching) return
    const id = setInterval(() => {
      const buf = bufferRef.current
      if (buf.length !== lastRenderedRef.current) {
        lastRenderedRef.current = buf.length
        setCards([...buf])
        setProgress((p) => ({ ...p, found: buf.length }))
      }
    }, RENDER_INTERVAL_MS)
    return () => clearInterval(id)
  }, [searching])

  // 페이지 로드 시 자동 쿠키
  useEffect(() => {
    fetch('/api/auto-cookies')
      .then((r) => r.json())
      .then((d) => { if (d.found) setCookieStatus('✅ 쿠키 자동 적용됨') })
      .catch(() => {})
  }, [])

  async function autoCookies() {
    setCookieStatus('⏳ 읽는 중...')
    try {
      const d = await fetch('/api/auto-cookies').then((r) => r.json())
      setCookieStatus(
        d.found
          ? '✅ 쿠키 자동 적용됨'
          : `⚠️ ${d.msg} (Chrome/Safari에서 daangn.com 열고 다시 시도)`,
      )
    } catch {
      setCookieStatus('⚠️ 자동 가져오기 실패')
    }
  }

  async function saveCookie() {
    const val = cookieInput.trim()
    const d = await fetch('/api/cookies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookies: val }),
    }).then((r) => r.json())
    if (d.ok) {
      setCookieStatus(val ? '✅ 쿠키 설정됨' : '미설정')
      setSavedBadge(!!val)
      setModalOpen(false)
    }
  }

  function copyCode() {
    navigator.clipboard.writeText('document.cookie').then(() => {
      setCopyLabel('✓ 복사됨')
      setTimeout(() => setCopyLabel('복사'), 1500)
    })
  }

  const finishSearch = useCallback((buf: CardData[], q: string, aborted = false) => {
    const sorted = [...buf].sort(
      (a, b) => scoreRelevance(b.title ?? '', q) - scoreRelevance(a.title ?? '', q),
    )
    bufferRef.current = sorted
    lastRenderedRef.current = sorted.length
    setCards(sorted)
    setProgress((p) => ({ ...p, found: sorted.length }))
    setSearching(false)
    searchingRef.current = false
    if (!aborted) setShowGuide(sorted.length === 0 ? 'empty' : false)
  }, [])

  async function doSearch() {
    const q = query.trim()
    if (!q) return

    // 초기화
    bufferRef.current = []
    lastRenderedRef.current = 0
    searchingRef.current = true
    setSearching(true)
    setShowGuide(false)
    setCards([])
    setProgress({ done: 0, total: 0, found: 0 })

    try {
      const res = await fetch(`/api/stream-search?q=${encodeURIComponent(q)}`)
      if (!res.body) { setSearching(false); return }

      const reader = res.body.getReader()
      readerRef.current = reader
      const decoder = new TextDecoder()
      let sseBuffer = ''

      while (searchingRef.current) {
        const { done, value } = await reader.read()
        if (done) break

        sseBuffer += decoder.decode(value, { stream: true })
        const lines = sseBuffer.split('\n')
        sseBuffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let json: Record<string, unknown>
          try { json = JSON.parse(line.slice(6)) } catch { continue }

          if (json.total !== undefined) {
            setProgress((p) => ({ ...p, total: json.total as number }))
          }
          if (json.region !== undefined && Array.isArray(json.articles)) {
            const newCards = (json.articles as Article[]).map((a) => ({
              ...a,
              region: json.region as string,
            }))
            bufferRef.current = [...bufferRef.current, ...newCards]
          }
          if (json.progress !== undefined) {
            setProgress((p) => ({ ...p, done: json.progress as number }))
          }
          if (json.done) {
            finishSearch(bufferRef.current, q)
            return
          }
        }
      }
    } catch {
      // 중지 또는 오류
    }

    finishSearch(bufferRef.current, query.trim(), true)
  }

  function stopSearch() {
    searchingRef.current = false
    readerRef.current?.cancel()
    finishSearch(bufferRef.current, query.trim(), true)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') doSearch()
  }

  function formatPrice(price?: number) {
    return price ? Number(price).toLocaleString('ko-KR') + '원' : '가격 미정'
  }

  function resolveHref(href?: string) {
    if (!href) return '#'
    return href.startsWith('http') ? href : `https://www.daangn.com${href}`
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <>
      {/* 헤더 */}
      <header>
        <div className="logo">🥕</div>
        <div style={{ flex: 1 }}>
          <h1>당근 전국검색</h1>
        </div>
        <div className="cookie-area">
          <div className="cookie-btns">
            <button className="btn-header" onClick={autoCookies} disabled={searching}>
              ⚡ 쿠키 자동가져오기
            </button>
            <button className="btn-header" onClick={() => setModalOpen(true)}>
              🔑 직접 입력
            </button>
          </div>
          <div className="cookie-status">{cookieStatus}</div>
        </div>
      </header>

      {/* 검색바 */}
      <div className="searchbar">
        <div className="search-row">
          <input
            className="search-input"
            type="text"
            placeholder="예: 비스포크 제트 헤드, 아이폰 15, 에어팟..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            disabled={searching}
          />
          {searching ? (
            <button className="btn-search btn-stop" onClick={stopSearch}>
              ⏹ 중지
            </button>
          ) : (
            <button className="btn-search" onClick={doSearch}>
              🔍 전국검색
            </button>
          )}
        </div>

        {/* 프로그레스 바 */}
        {searching && progress.total > 0 && (
          <div className="progress-bar-wrap">
            <div className="progress-bar" style={{ width: `${pct}%` }} />
          </div>
        )}

        <div className="search-status">
          {searching ? (
            <>
              <span className="spin" />
              {pct}% 검색 중 ({progress.found.toLocaleString()}개 발견)
            </>
          ) : cards.length > 0 ? (
            <>
              ✅ 총 <strong>{cards.length.toLocaleString()}개</strong> 매물 발견 —{' '}
              <span style={{ fontSize: 11, color: '#aaa' }}>관련도순 정렬</span>
            </>
          ) : null}
        </div>
      </div>

      {/* 결과 그리드 */}
      <div className="results">
        {showGuide === 'init' && (
          <div className="guide">
            <div className="gi">🥕</div>
            <h2>전국 당근 매물을 한번에 검색하세요</h2>
            <p>
              전국 3,076개 지역을 동시에 검색해 결과를 보여줍니다.
              <br />
              <strong>더 많은 결과</strong>를 원하면 우측 상단{' '}
              <strong>🔑 쿠키 설정</strong>을 해주세요.
            </p>
          </div>
        )}
        {showGuide === 'empty' && (
          <div className="guide">
            <div className="gi">😢</div>
            <h2>검색 결과가 없어요</h2>
            <p>다른 검색어로 시도하거나, 쿠키를 설정하면 더 많은 결과를 볼 수 있어요.</p>
          </div>
        )}

        {cards.map((a, i) => {
          const thumb = a.thumbnail ?? (Array.isArray(a.images) ? a.images[0] : '')
          return (
            <a
              key={i}
              className="card"
              href={resolveHref(a.href)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="card-img">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" loading="lazy" />
                ) : (
                  <div className="no-img">📦</div>
                )}
              </div>
              <div className="card-body">
                <div className="card-title">{a.title ?? ''}</div>
                <div className="card-price">{formatPrice(a.price)}</div>
                <div className="card-region">📍 {a.region}</div>
              </div>
            </a>
          )
        })}
      </div>

      {/* 쿠키 모달 */}
      {modalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}
        >
          <div className="modal-box">
            <h2>
              🔑 당근 로그인 쿠키 설정{' '}
              {savedBadge && <span className="saved-badge">저장됨 ✓</span>}
            </h2>
            <p className="modal-desc">
              쿠키를 설정하면 로그인 상태로 검색해 더 정확한 결과를 볼 수 있어요.
              <br />
              <strong>
                1. 크롬에서{' '}
                <a
                  href="https://www.daangn.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#FF6F0F' }}
                >
                  daangn.com
                </a>{' '}
                로그인 후
              </strong>
              <br />
              <strong>2. 아래 코드를 콘솔(F12 → Console)에 붙여넣고 실행</strong>
            </p>
            <div className="code-block">
              document.cookie
              <button className="copy-btn" onClick={copyCode}>
                {copyLabel}
              </button>
            </div>
            <label>📋 콘솔에서 출력된 값을 여기에 붙여넣기</label>
            <textarea
              placeholder="s_da=xxxx; carrot_uid=xxxx; ..."
              value={cookieInput}
              onChange={(e) => setCookieInput(e.target.value)}
            />
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setModalOpen(false)}>
                취소
              </button>
              <button className="btn-save" onClick={saveCookie}>
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
