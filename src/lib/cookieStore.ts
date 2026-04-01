// 서버 프로세스 생애 동안 쿠키를 메모리에 보관하는 싱글턴
const store: { cookies: string } = { cookies: '' }

export function getCookies(): string {
  return store.cookies
}

export function setCookies(value: string): void {
  store.cookies = value
}
