import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '🥕 당근 전국검색',
  description: '전국 3,076개 지역 당근마켓 매물을 한번에 검색',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
