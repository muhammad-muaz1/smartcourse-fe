import { api } from '@/lib/api/client'
import { clearSession, setTokens, setUser, toStoredTokens, useSession } from '@/lib/api/session'
import type { RegisterInput, TokenPair, User } from '@/lib/api/types'

export const authApi = {
  login: (email: string, password: string) =>
    api.post<TokenPair>('/auth/login', { email, password }, { auth: false }),
  register: (input: RegisterInput) => api.post<User>('/auth/register', input, { auth: false }),
  me: (token?: string) => api.get<User>('/auth/me', token ? { token } : undefined),
  logout: (refreshToken: string) =>
    api.post<null>('/auth/logout', { refresh_token: refreshToken }),
  forgotPassword: (email: string) =>
    api.post<null>('/auth/password/forgot', { email }, { auth: false }),
  resetPassword: (token: string, newPassword: string) =>
    api.post<null>('/auth/password/reset', { token, new_password: newPassword }, { auth: false }),
}

/** Login + profile fetch; the session only flips to authenticated with a user loaded. */
export async function signIn(email: string, password: string): Promise<User> {
  const pair = await authApi.login(email, password)
  setTokens(toStoredTokens(pair))
  const user = await authApi.me()
  setUser(user)
  return user
}

export async function signOut(): Promise<void> {
  const refreshToken = useSession.getState().tokens?.refreshToken
  try {
    if (refreshToken) await authApi.logout(refreshToken)
  } finally {
    // Local sign-out must happen even if the revoke call fails (offline, expired).
    clearSession()
  }
}

/** Restore a persisted session on app start. Never throws. */
export async function bootstrapSession(): Promise<void> {
  if (!useSession.getState().tokens) {
    useSession.setState({ status: 'anonymous' })
    return
  }
  try {
    setUser(await authApi.me())
  } catch {
    clearSession()
  }
}
