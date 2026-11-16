import { api, isApiError } from '@/lib/api/client'
import type { TokenPair, User } from '@/lib/api/types'
import { runPool } from './pool'

/**
 * A reusable cohort of throwaway accounts the demo acts as: one instructor plus N
 * students. Identity throttles registration per IP (default 10/hour), so accounts are
 * created once, persisted, and reused across runs — every run creates a fresh course,
 * so the same students can race again.
 *
 * These are synthetic dev accounts on `example.com` (RFC 2606). The password is random
 * per browser and stored locally only because the demo must log back in as them.
 */

const STORAGE_KEY = 'smartcourse.demo.cohort.v1'
const TOKEN_TTL_MS = 10 * 60_000 // identity access tokens live 15 min

export interface DemoAccount {
  email: string
  name: string
}

interface CohortState {
  tag: string
  password: string
  instructor: DemoAccount | null
  students: DemoAccount[]
}

export interface Actor extends DemoAccount {
  id: string
  token: string
}

export class CohortError extends Error {}

function randomToken(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('')
}

function load(): CohortState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as CohortState
  } catch {
    // Fall through to a fresh cohort.
  }
  return { tag: randomToken(6), password: `Demo-${randomToken(16)}`, instructor: null, students: [] }
}

function save(state: CohortState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function cohortSize(): { instructor: boolean; students: number } {
  const state = load()
  return { instructor: !!state.instructor, students: state.students.length }
}

export function resetCohort(): void {
  localStorage.removeItem(STORAGE_KEY)
  sessions.clear()
}

async function registerAccount(state: CohortState, account: DemoAccount, role: 'student' | 'instructor') {
  try {
    await api.post<User>('/auth/register', { ...account, full_name: account.name, password: state.password, role }, { auth: false })
  } catch (error) {
    if (isApiError(error, 'CONFLICT')) return // registered by an earlier, interrupted run
    if (isApiError(error) && error.status === 429) {
      throw new CohortError(
        'Identity is throttling registrations from this IP (default 10/hour). Accounts created so far are kept — ' +
          'run again later, use fewer students, or raise SMARTCOURSE_SECURITY__REGISTER_THROTTLE_PER_HOUR on the identity service in your dev env.',
      )
    }
    throw error
  }
}

/** Make sure the cohort has an instructor and at least `students` students. */
export async function ensureCohort(
  students: number,
  onProgress: (created: number, needed: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const state = load()
  save(state)
  const needed = (state.instructor ? 0 : 1) + Math.max(0, students - state.students.length)
  let created = 0
  onProgress(created, needed)

  if (!state.instructor) {
    const instructor = { email: `sc-demo-${state.tag}-instructor@example.com`, name: 'Demo Instructor' }
    await registerAccount(state, instructor, 'instructor')
    state.instructor = instructor
    save(state)
    onProgress(++created, needed)
  }

  const start = state.students.length
  const missing = Math.max(0, students - start)
  // Sequential-ish: registration hashes passwords with Argon2 — be a polite client.
  await runPool(missing, 3, async (i) => {
    const n = start + i + 1
    const student = { email: `sc-demo-${state.tag}-s${n}@example.com`, name: `Demo Student ${n}` }
    await registerAccount(state, student, 'student')
    state.students.push(student)
    save(state)
    onProgress(++created, needed)
  }, signal)
}

// Tokens live in memory only — never persisted for synthetic accounts.
const sessions = new Map<string, { actor: Actor; at: number }>()

async function login(account: DemoAccount, password: string): Promise<Actor> {
  const cached = sessions.get(account.email)
  if (cached && Date.now() - cached.at < TOKEN_TTL_MS) return cached.actor
  const pair = await api.post<TokenPair>('/auth/login', { email: account.email, password }, { auth: false })
  const me = await api.get<User>('/auth/me', { token: pair.access_token })
  const actor = { ...account, id: me.id, token: pair.access_token }
  sessions.set(account.email, { actor, at: Date.now() })
  return actor
}

export async function signInCohort(
  students: number,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<{ instructor: Actor; students: Actor[] }> {
  const state = load()
  if (!state.instructor) throw new CohortError('Cohort has no instructor — run setup first.')
  const accounts = state.students.slice(0, students)
  const actors: Actor[] = new Array(accounts.length)
  let done = 0
  const instructor = await login(state.instructor, state.password)
  onProgress(++done, accounts.length + 1)
  await runPool(accounts.length, 6, async (i) => {
    actors[i] = await login(accounts[i]!, state.password)
    onProgress(++done, accounts.length + 1)
  }, signal)
  return { instructor, students: actors }
}
