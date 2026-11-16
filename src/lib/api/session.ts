import { create } from 'zustand'
import type { TokenPair, User } from './types'

/**
 * Token session shared by the API client and the UI.
 *
 * The backend returns tokens in the response body (no httpOnly cookie), so they have to
 * live in JS-reachable storage. Both tokens are persisted together under one key so that
 * several tabs can coordinate refresh rotation: identity revokes the whole token family
 * when a rotated-out refresh token is replayed, so two tabs racing to refresh with the
 * same token would log the user out everywhere. See `refreshSession` in client.ts.
 */

const STORAGE_KEY = 'smartcourse.session'
// Refresh this long before expiry so an in-flight request never carries a dead token.
const EXPIRY_SKEW_MS = 30_000

export interface StoredTokens {
  accessToken: string
  refreshToken: string
  /** Epoch ms after which the access token should be treated as expired. */
  expiresAt: number
}

export type SessionStatus = 'booting' | 'authenticated' | 'anonymous'

interface SessionState {
  status: SessionStatus
  tokens: StoredTokens | null
  user: User | null
}

export function readStoredTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredTokens) : null
  } catch {
    // Corrupt or inaccessible storage is equivalent to "not signed in".
    return null
  }
}

export const useSession = create<SessionState>(() => ({
  status: 'booting',
  tokens: readStoredTokens(),
  user: null,
}))

export function toStoredTokens(pair: TokenPair): StoredTokens {
  return {
    accessToken: pair.access_token,
    refreshToken: pair.refresh_token,
    expiresAt: Date.now() + pair.expires_in * 1000 - EXPIRY_SKEW_MS,
  }
}

export function setTokens(tokens: StoredTokens | null): void {
  if (tokens) localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens))
  else localStorage.removeItem(STORAGE_KEY)
  useSession.setState({ tokens })
}

export function setUser(user: User): void {
  useSession.setState({ user, status: 'authenticated' })
}

export function clearSession(): void {
  setTokens(null)
  useSession.setState({ user: null, status: 'anonymous' })
}

// Another tab rotated or cleared the tokens: adopt its view instead of refreshing again.
window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return
  const tokens = readStoredTokens()
  if (tokens) useSession.setState({ tokens })
  else useSession.setState({ tokens: null, user: null, status: 'anonymous' })
})
