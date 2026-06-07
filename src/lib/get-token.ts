/**
 * 从 localStorage 获取最新的 accessToken
 * 优先从 auth-storage（zustand persist）获取，因为 token 刷新后该处是最新的
 * 回退到 accessToken key
 */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      const parsed = JSON.parse(authStorage);
      if (parsed?.state?.token) return parsed.state.token;
    }
  } catch {}
  return localStorage.getItem('accessToken') || localStorage.getItem('token') || null;
}
