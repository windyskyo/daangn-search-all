'use client'

import { useEffect, useRef, useState } from 'react'

interface Article {
  title?: string
  price?: number
  thumbnail?: string
  images?: string[]
  href?: string
  status?: string
}

interface SearchResult {
  region: string
  articles: Article[]
}

const BATCH = 15

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [cookieStatus, setCookieStatus] = useState('미설정 (설정 시 더 많은 결과)')
  const [statusMsg, setStatusMsg] = useState('')
  const [cards, setCards] = useState<(Article & { region: string })[]>([])
  const [searching, setSearching] = useState(false)
  const [showGuide, setShowGuide] = useState<'init' | 'empty' | false>('init')
  const [modalOpen, setModalOpen] = useState(false)
  const [cookieInput, setCookieInput] = useState('')
  const [savedBadge, setSavedBadge] = useState(false)
  const [copyLabel, setCopyLabel] = useState('복사')
  const abortedRef = useRef(false)

  // 페이지 로드 시 쿠키 자동 시도
  useEffect(() => {
    fetch('/api/auto-cookies')
      .then((r) => r.json())
      .then((d) => {
        if (d.found) setCookieStatus('✅ 쿠키 자동 적용됨')
      })
      .catch(() => {})
  }, [])

  async function autoCookies() {
    setCookieStatus('⏳ 읽는 중...')
    try {
      const res = await fetch('/api/auto-cookies')
      const d = await res.json()
      if (d.found) {
        setCookieStatus('✅ 쿠키 자동 적용됨')
      } else {
        setCookieStatus(`⚠️ ${d.msg} (Chrome/Safari에서 daangn.com 열고 다시 시도)`)
      }
    } catch {
      setCookieStatus('⚠️ 자동 가져오기 실패')
    }
  }

  async function saveCookie() {
    const val = cookieInput.trim()
    const res = await fetch('/api/cookies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookies: val }),
    })
    const d = await res.json()
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

  async function doSearch() {
    if (!query.trim()) return
    abortedRef.current = false
    setSearching(true)
    setShowGuide(false)
    setCards([])
    setStatusMsg('')

    // 지역 ID 가져오기
    setStatusMsg('지역 목록 로딩...')
    let ids: number[] = []
    try {
      const r = await fetch('/api/regions')
      const d = await r.json()
      ids = d.ids ?? []
    } catch {
      setStatusMsg('서버 연결 실패')
      setSearching(false)
      return
    }

    let found = 0
    let done = 0
    const total = ids.length

    for (let i = 0; i < ids.length; i += BATCH) {
      if (abortedRef.current) break
      const batch = ids.slice(i, i + BATCH)

      await Promise.all(
        batch.map(async (id) => {
          try {
            const r = await fetch(`/api/search?q=${encodeURIComponent(query)}&id=${id}`)
            const d: SearchResult = await r.json()
            const newCards = (d.articles ?? []).map((a) => ({ ...a, region: d.region }))
            if (newCards.length > 0) {
              found += newCards.length
              setCards((prev) => [...prev, ...newCards])
            }
          } catch {}
          done++
        }),
      )

      const pct = Math.round((done / total) * 100)
      setStatusMsg(`검색 중 ${pct}% (${found}개 발견)`)
    }

    setSearching(false)

    if (found === 0) {
      setShowGuide('empty')
      setStatusMsg(`검색 완료 — ${total}개 지역 검색`)
    } else {
      setStatusMsg(`✅ 총 ${found}개 매물 발견 (${total}개 지역)`)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') doSearch()
  }

  function formatPrice(price?: number) {
    if (!price) return '가격 미정'
    return Number(price).toLocaleString('ko-KR') + '원'
  }

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
            <button
              className="btn-header"
              onClick={autoCookies}
              disabled={searching}
            >
              ⚡ 쿠키 자동가져오기
            </button>
            <button
              className="btn-header"
              onClick={() => setModalOpen(true)}
            >
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
          />
          {searching ? (
            <button
              className="btn-search btn-stop"
              onClick={() => { abortedRef.current = true }}
            >
              ⏹ 중지
            </button>
          ) : (
            <button className="btn-search" onClick={doSearch}>
              🔍 전국검색
            </button>
          )}
        </div>
        <div className="search-status">
          {searching && <span className="spin" />}
          {statusMsg}
        </div>
      </div>

      {/* 결과 그리드 */}
      <div className="results">
        {showGuide === 'init' && (
          <div className="guide">
            <div className="gi">🥕</div>
            <h2>전국 당근 매물을 한번에 검색하세요</h2>
            <p>
              서버가 전국 여러 지역을 동시에 검색해 결과를 보여줍니다.
              <br />
              <strong>더 많은 결과</strong>를 원하면 우측 상단{' '}
              <strong>🔑 쿠키 설정</strong>에서
              <br />
              당근 로그인 쿠키를 입력해주세요.
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
              href={a.href ? (a.href.startsWith('http') ? a.href : `https://www.daangn.com${a.href}`) : '#'}
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
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}>
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
                <a href="https://www.daangn.com" target="_blank" rel="noopener noreferrer" style={{ color: '#FF6F0F' }}>
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
