import { clearSession, readStoredTokens, setTokens, toStoredTokens, useSession } from './session'
import type { Envelope, ErrorBody, FieldError, Meta, TokenPair } from './types'

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
export const API_PREFIX = `${API_BASE}/api/v1`

/** Error carrying the backend's stable error contract (platform-core handlers.py). */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: FieldError[]
  readonly requestId: string | null

  constructor(status: number, body: Partial<ErrorBody>, fallbackMessage: string) {
    super(body.message ?? fallbackMessage)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code ?? (status === 0 ? 'NETWORK_ERROR' : 'HTTP_ERROR')
    this.details = body.details ?? []
    this.requestId = body.request_id ?? null
  }

  /** Field-level messages keyed by the last path segment, for form binding. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries(
      this.details.map((d) => [d.field.split('.').at(-1) ?? d.field, d.message]),
    )
  }
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code)
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}

type Query = Record<string, string | number | boolean | null | undefined>

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Query
  /** Attach the session's bearer token (default true). */
  auth?: boolean
  /** Act as someone other than the session user — used by the demo's virtual cohort. */
  token?: string
  /** Required by the backend's ★ endpoints; a retry must reuse the same key. */
  idempotencyKey?: string
  signal?: AbortSignal
  /** Path is outside /api/v1 (e.g. /health). */
  raw?: boolean
  /** Send this body verbatim instead of JSON (e.g. a File for an upload). When it's a
   *  File/Blob the browser sets Content-Type from the blob; `body` is ignored. */
  rawBody?: BodyInit
}

/** Everything a caller might want from one exchange; most callers only use `data`. */
export interface ApiResult<T> {
  data: T
  meta: Meta | null
  status: number
  requestId: string | null
  replayed: boolean
  durationMs: number
}

function buildUrl(path: string, query: Query | undefined, raw: boolean): string {
  const base = raw ? API_BASE : API_PREFIX
  if (!query) return `${base}${path}`
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${base}${path}?${qs}` : `${base}${path}`
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return { message: text }
  }
}

function send(path: string, options: RequestOptions, token: string | null): Promise<Response> {
  const headers = new Headers({ Accept: 'application/json' })
  const hasRaw = options.rawBody !== undefined
  // Leave Content-Type unset for a raw body: the browser fills it from a File/Blob, which
  // is how the server learns the upload's MIME type.
  if (!hasRaw && options.body !== undefined) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey)

  const body = hasRaw
    ? options.rawBody
    : options.body === undefined
      ? undefined
      : JSON.stringify(options.body)

  return fetch(buildUrl(path, options.query, options.raw ?? false), {
    method: options.method ?? 'GET',
    headers,
    body,
    signal: options.signal,
  })
}

// ---- refresh: single flight per tab, serialised across tabs -----------------------

let inflightRefresh: Promise<string | null> | null = null

async function rotateTokens(usedRefreshToken: string): Promise<string | null> {
  // Inside the cross-tab lock: if another tab already rotated, adopt its pair rather
  // than replaying a token identity has retired (which would revoke the whole family).
  const stored = readStoredTokens()
  if (stored && stored.refreshToken !== usedRefreshToken && stored.expiresAt > Date.now()) {
    useSession.setState({ tokens: stored })
    return stored.accessToken
  }
  const current = stored ?? useSession.getState().tokens
  if (!current) return null

  const response = await send(
    '/auth/refresh',
    { method: 'POST', body: { refresh_token: current.refreshToken } },
    null,
  )
  if (!response.ok) {
    clearSession()
    return null
  }
  const { data } = (await parseBody(response)) as Envelope<TokenPair>
  const tokens = toStoredTokens(data)
  setTokens(tokens)
  return tokens.accessToken
}

export function refreshSession(): Promise<string | null> {
  const used = useSession.getState().tokens?.refreshToken
  if (!used) return Promise.resolve(null)
  inflightRefresh ??= (
    'locks' in navigator
      ? navigator.locks.request('smartcourse.refresh', () => rotateTokens(used))
      : rotateTokens(used)
  ).finally(() => {
    inflightRefresh = null
  })
  return inflightRefresh
}

async function sessionToken(): Promise<string | null> {
  const tokens = useSession.getState().tokens
  if (!tokens) return null
  if (tokens.expiresAt > Date.now()) return tokens.accessToken
  return refreshSession()
}

// ---- public surface ---------------------------------------------------------------

export async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const useSessionAuth = options.token === undefined && (options.auth ?? true)
  let token = options.token ?? (useSessionAuth ? await sessionToken() : null)

  const started = performance.now()
  let response: Response
  try {
    response = await send(path, options, token)
    // One retry after a refresh: the token may have been revoked or clock-skewed.
    if (response.status === 401 && useSessionAuth && token) {
      token = await refreshSession()
      if (token) response = await send(path, options, token)
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, {}, 'Network error — is the gateway running?')
  }
  const durationMs = performance.now() - started
  const body = await parseBody(response)
  const requestId = response.headers.get('X-Request-ID')

  if (!response.ok) {
    const errorBody = (body ?? {}) as Partial<ErrorBody>
    throw new ApiError(response.status, { request_id: requestId, ...errorBody }, response.statusText)
  }

  const envelope =
    body !== null && typeof body === 'object' && 'data' in body && 'meta' in body
      ? (body as Envelope<T>)
      : null
  return {
    data: (envelope ? envelope.data : body) as T,
    meta: envelope?.meta ?? null,
    status: response.status,
    requestId: requestId ?? envelope?.meta.request_id ?? null,
    replayed: response.headers.get('Idempotent-Replayed') === 'true',
    durationMs,
  }
}

type VerbOptions = Omit<RequestOptions, 'method' | 'body'>

async function dataOf<T>(path: string, options: RequestOptions): Promise<T> {
  return (await request<T>(path, options)).data
}

/** Thin verb helpers returning only `data`. Use `request` when meta/headers matter. */
export const api = {
  get: <T>(path: string, options?: VerbOptions) => dataOf<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: VerbOptions) =>
    dataOf<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: VerbOptions) =>
    dataOf<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: VerbOptions) =>
    dataOf<T>(path, { ...options, method: 'PATCH', body }),
  delete: (path: string, options?: VerbOptions) => dataOf<null>(path, { ...options, method: 'DELETE' }),
  /** POST a file as the raw request body (the asset upload endpoint). */
  upload: <T>(path: string, file: File, options?: VerbOptions) =>
    dataOf<T>(path, { ...options, method: 'POST', rawBody: file }),
}

/**
 * Fetch a protected binary (an asset's bytes) with the session token and hand back a
 * Blob. A plain <a href> can't carry the Authorization header, so downloads go through
 * fetch; the caller turns the Blob into an object URL to save or preview.
 */
export async function downloadBlob(path: string, query?: Query): Promise<Blob> {
  const token = await sessionToken()
  const response = await send(path, { method: 'GET', query }, token)
  if (!response.ok) {
    const body = (await parseBody(response)) as Partial<ErrorBody>
    throw new ApiError(response.status, body, response.statusText)
  }
  return response.blob()
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID()
}
