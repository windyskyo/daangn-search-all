import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { setCookies } from '@/lib/cookieStore'

const CHROME_SCRIPT = `
tell application "Google Chrome"
  set found to ""
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "daangn.com" then
        set found to execute javascript "document.cookie" in t
      end if
    end repeat
  end repeat
  return found
end tell`

const SAFARI_SCRIPT = `
tell application "Safari"
  set found to ""
  repeat with w in windows
    if exists (tabs of w) then
      repeat with t in tabs of w
        if URL of t contains "daangn.com" then
          set found to do JavaScript "document.cookie" in t
        end if
      end repeat
    end if
  end repeat
  return found
end tell`

function tryAppleScript(script: string): string {
  try {
    const result = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
      timeout: 6_000,
      encoding: 'utf8',
    }).trim()
    if (result && result.length > 5 && result.includes('=')) {
      return result
    }
  } catch {
    // 브라우저가 없거나 권한이 없으면 무시
  }
  return ''
}

export async function GET() {
  if (process.platform !== 'darwin') {
    return NextResponse.json({ ok: true, found: false, msg: 'macOS에서만 지원됩니다' })
  }

  for (const script of [CHROME_SCRIPT, SAFARI_SCRIPT]) {
    const ck = tryAppleScript(script)
    if (ck) {
      setCookies(ck)
      return NextResponse.json({ ok: true, found: true, msg: '쿠키 자동 적용됨 ✅' })
    }
  }

  return NextResponse.json({
    ok: true,
    found: false,
    msg: 'daangn.com 탭을 찾지 못했습니다',
  })
}
