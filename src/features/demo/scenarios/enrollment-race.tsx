import { Play, RotateCcw, Square } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { analyticsApi } from '@/features/analytics/api'
import { learningApi } from '@/features/learning/api'
import { notificationsApi } from '@/features/notifications/api'
import { ApiError, isApiError, newIdempotencyKey } from '@/lib/api/client'
import type { CursorPage, Enrollment } from '@/lib/api/types'
import { fmt, sleep, timeAgo } from '@/lib/utils'
import { ErrorBanner, Metric, ScenarioSection, StepList, Verdict } from '../components'
import { cohortSize, ensureCohort, resetCohort, signInCohort, type Actor } from '../lib/cohort'
import { createDemoCourse, pollUntil, startPublish, TimeoutError, waitForRun, waitUntilEnrollable } from '../lib/fixtures'
import { runPool } from '../lib/pool'
import { useSteps } from '../lib/use-steps'

const STEPS = [
  { id: 'cohort', label: 'Prepare the demo cohort (instructor + students)' },
  { id: 'course', label: 'Instructor creates a seat-limited course and publishes it' },
  { id: 'propagate', label: 'Wait until learning opens enrollment (probe student enrolls, then withdraws)' },
  { id: 'race', label: 'Every student enrolls at the same instant' },
  { id: 'abuse', label: 'Duplicate enrollments and an idempotent retry' },
  { id: 'background', label: 'Background fan-out: welcome notifications' },
  { id: 'consistency', label: 'Cross-service consistency: learning roster vs analytics projection' },
]

interface Attempt {
  student: string
  status: number
  code: string
  ms: number
  requestId: string | null
  enrollmentId: string | null
}

interface RaceResult {
  courseId: string
  title: string
  seats: number
  students: number
  attempts: Attempt[]
  winners: number
  spreadMs: number
  settledMs: number
  propagationMs: number
  duplicates?: { attempted: number; rejected: number }
  replay?: { sameEnrollment: boolean; replayedHeader: boolean }
  background?: { expected: number; delivered: number; ms: number | null; timedOut: boolean }
  consistency?: { roster: number; analytics: number | null; asOf: string | null }
}

function outcomeOf(error: unknown): { status: number; code: string; requestId: string | null } {
  if (error instanceof ApiError) return { status: error.status, code: error.code, requestId: error.requestId }
  return { status: 0, code: 'ERROR', requestId: null }
}

async function countRoster(courseId: string, token: string, signal: AbortSignal): Promise<number> {
  let total = 0
  let cursor: string | null = null
  do {
    const page: CursorPage<Enrollment> = (await learningApi.roster(courseId, { cursor, limit: 100, token, signal })).data
    total += page.items.filter((e) => e.status !== 'withdrawn').length
    cursor = page.has_more ? page.next_cursor : null
  } while (cursor)
  return total
}

export function EnrollmentRaceScenario() {
  const [students, setStudents] = useState(8)
  const [seats, setSeats] = useState(3)
  const [result, setResult] = useState<RaceResult | null>(null)
  const [cohort, setCohort] = useState(cohortSize)
  const { steps, running, error, step, run, cancel } = useSteps(STEPS)

  const start = () =>
    run(async (signal) => {
      setResult(null)
      const update = (patch: Partial<RaceResult>) => setResult((prev) => (prev ? { ...prev, ...patch } : prev))

      const actors = await step('cohort', async (detail) => {
        // One extra student is the readiness probe and never takes part in the race.
        await ensureCohort(students + 1, (done, needed) => needed && detail(`Registering accounts ${done}/${needed}`), signal)
        setCohort(cohortSize())
        return signInCohort(students + 1, (done, total) => detail(`Signing in ${done}/${total}`), signal)
      })
      const { instructor } = actors
      const probe = actors.students.at(-1)!
      const cohortStudents: Actor[] = actors.students.slice(0, students)

      const { course, publishedAt } = await step('course', async (detail) => {
        const title = `Launch-day rush · ${new Date().toLocaleTimeString()}`
        const created = await createDemoCourse(instructor.token, { title, seats })
        detail('Publish workflow running…')
        const { data: started } = await startPublish(created.id, instructor.token)
        const finished = await waitForRun(created.id, started.id, instructor.token, signal)
        if (finished.status !== 'succeeded') throw new Error(`Publish failed at ${finished.failed_step}: ${finished.error}`)
        detail(`${seats} seats · published`)
        return { course: created, publishedAt: performance.now() }
      })

      const propagationMs = await step('propagate', async (detail) => {
        await waitUntilEnrollable(course.id, probe.token, signal)
        const lag = performance.now() - publishedAt
        detail(`Enrollment opened ${fmt.ms(lag)} after publish (outbox → Kafka → course_cache); probe seat released`)
        return lag
      })

      const keys = cohortStudents.map(() => newIdempotencyKey())
      const attempts = await step('race', async (detail) => {
        const dispatched: number[] = []
        const t0 = performance.now()
        // One synchronous loop: every request is issued in the same event-loop tick.
        const inFlight = cohortStudents.map(async (student, i): Promise<Attempt> => {
          dispatched.push(performance.now())
          const started = performance.now()
          try {
            const res = await learningApi.enroll(course.id, { token: student.token, idempotencyKey: keys[i], signal })
            return { student: student.name, status: res.status, code: 'ENROLLED', ms: performance.now() - started, requestId: res.requestId, enrollmentId: res.data.id }
          } catch (e) {
            return { student: student.name, ...outcomeOf(e), ms: performance.now() - started, enrollmentId: null }
          }
        })
        const settled = await Promise.all(inFlight)
        const winners = settled.filter((a) => a.enrollmentId).length
        setResult({
          courseId: course.id,
          title: course.title,
          seats,
          students: cohortStudents.length,
          attempts: settled,
          winners,
          spreadMs: Math.max(...dispatched) - Math.min(...dispatched),
          settledMs: performance.now() - t0,
          propagationMs,
        })
        detail(`${winners} enrolled, ${settled.length - winners} rejected`)
        return settled
      })
      const winnerIdx = attempts.flatMap((a, i) => (a.enrollmentId ? [i] : []))

      await step('abuse', async (detail) => {
        // Same student, *new* key: a genuine second attempt → refused by the unique constraint.
        const dupeIdx = winnerIdx.slice(0, 3)
        const dupes = await Promise.all(
          dupeIdx.map((i) =>
            learningApi
              .enroll(course.id, { token: cohortStudents[i]!.token, signal })
              .then(() => false, (e: unknown) => isApiError(e, 'ALREADY_ENROLLED')),
          ),
        )
        // Same student, *same* key: a client retry → the stored response, replayed verbatim.
        let replay: RaceResult['replay']
        const first = winnerIdx[0]
        if (first !== undefined) {
          const retry = await learningApi.enroll(course.id, { token: cohortStudents[first]!.token, idempotencyKey: keys[first], signal })
          replay = { sameEnrollment: retry.data.id === attempts[first]!.enrollmentId, replayedHeader: retry.replayed }
        }
        const rejected = dupes.filter(Boolean).length
        update({ duplicates: { attempted: dupes.length, rejected }, replay })
        detail(`${rejected}/${dupes.length} duplicates rejected${replay ? ' · retry replayed' : ''}`)
      })

      await step('background', async (detail) => {
        const t0 = performance.now()
        const subject = `Welcome to ${course.title}`
        const waiting = new Set(winnerIdx)
        let timedOut = false
        try {
          await pollUntil(
            async () => {
              const batch = [...waiting]
              await runPool(batch.length, 6, async (j) => {
                const i = batch[j]!
                const inbox = await notificationsApi.inbox({ token: cohortStudents[i]!.token, limit: 30, signal })
                if (inbox.items.some((n) => n.kind === 'course_welcome' && n.subject === subject)) waiting.delete(i)
              }, signal)
              detail(`${winnerIdx.length - waiting.size}/${winnerIdx.length} welcome notifications delivered`)
              return waiting.size === 0 ? true : undefined
            },
            { intervalMs: 1_000, timeoutMs: 60_000, signal, what: 'welcome notifications' },
          )
        } catch (e) {
          if (!(e instanceof TimeoutError)) throw e
          timedOut = true
        }
        update({
          background: {
            expected: winnerIdx.length,
            delivered: winnerIdx.length - waiting.size,
            ms: timedOut ? null : performance.now() - t0,
            timedOut,
          },
        })
      })

      await step('consistency', async (detail) => {
        const roster = await countRoster(course.id, instructor.token, signal)
        // analytics caches this projection (5 min). Reading only after the fan-out has
        // settled avoids pinning a pre-convergence snapshot in that cache.
        await sleep(1_500, signal)
        const projection = await pollUntil(
          async () => {
            try {
              return await analyticsApi.course(course.id, { token: instructor.token, signal })
            } catch (e) {
              if (isApiError(e, 'COURSE_NOT_FOUND')) return undefined
              throw e
            }
          },
          { intervalMs: 1_000, timeoutMs: 60_000, signal, what: 'the analytics projection' },
        )
        // `enrollments` counts withdrawals too (the probe's); compare current enrollments.
        const analytics = projection.data.enrollments - projection.data.withdrawn
        update({ consistency: { roster, analytics, asOf: projection.asOf } })
        detail(`roster ${roster} · analytics ${analytics}`)
      })
    })

  const expectedWinners = result ? Math.min(result.seats, result.students) : 0
  const codes = result?.attempts.reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.code]: (acc[a.code] ?? 0) + 1 }), {})

  return (
    <ScenarioSection
      id="race"
      number={2}
      problem="Data inconsistency · unreliable background processing"
      title="Same-second enrollment rush"
      mechanism={
        <>
          Enrollment is <strong>one transaction</strong> in the learning service: a <code>SELECT … FOR UPDATE</code> row lock on the seat counter,
          a unique constraint on <code>(student, course)</code>, progress initialisation and an outbox row. Retries carry an{' '}
          <code>Idempotency-Key</code>. The welcome notification and the analytics update are independent Kafka consumers — they never slow the
          enrollment down, and they cannot be lost.
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Students">
              {(a) => <Input {...a} type="number" min={2} max={200} value={students} disabled={running} onChange={(e) => setStudents(Math.max(2, Math.min(200, Number(e.target.value) || 2)))} />}
            </Field>
            <Field label="Seats">
              {(a) => <Input {...a} type="number" min={1} max={200} value={seats} disabled={running} onChange={(e) => setSeats(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} />}
            </Field>
          </div>
          <p className="text-xs leading-5 text-zinc-500">
            Cohort on this browser: {cohort.instructor ? '1 instructor' : 'no instructor'}, {cohort.students} students (one extra is used as a readiness probe). Accounts are reused across
            runs; identity throttles new registrations (10/hour per IP by default).
          </p>
          <div className="flex gap-2">
            {running ? (
              <Button variant="danger" icon={<Square className="size-4" />} onClick={cancel}>Cancel</Button>
            ) : (
              <Button icon={<Play className="size-4" />} onClick={() => void start()}>Start the rush</Button>
            )}
            <Button variant="ghost" size="sm" icon={<RotateCcw className="size-3.5" />} disabled={running}
              onClick={() => { if (confirm('Forget the demo cohort on this browser? New accounts will be registered next run.')) { resetCohort(); setCohort(cohortSize()) } }}>
              Reset cohort
            </Button>
          </div>
          <StepList steps={steps} />
          <ErrorBanner message={error} />
        </div>

        <div className="space-y-5">
          {!result ? (
            <div className="grid h-full min-h-48 place-items-center rounded-xl border border-dashed border-zinc-200 text-sm text-zinc-400">
              Results appear here as the scenario runs.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Seats" value={result.seats} />
                <Metric label="Simultaneous requests" value={result.students} sub={`dispatched within ${fmt.ms(result.spreadMs)}`} />
                <Metric label="Enrolled" value={result.winners} sub={`all settled in ${fmt.ms(result.settledMs)}`} />
                <Metric label="Event propagation" value={fmt.ms(result.propagationMs)} sub="publish → learning read model" />
              </div>

              <div className="rounded-xl border border-zinc-200 p-4">
                <p className="mb-3 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Race correctness</p>
                <ul className="space-y-1.5">
                  <Verdict pass={result.winners === expectedWinners}>Exactly {expectedWinners} of {result.students} students got a seat — no overbooking (got {result.winners})</Verdict>
                  <Verdict pass={(codes?.COURSE_FULL ?? 0) === result.students - expectedWinners}>
                    Every other request was cleanly refused with <code>COURSE_FULL</code> ({codes?.COURSE_FULL ?? 0})
                  </Verdict>
                  <Verdict pass={!result.attempts.some((a) => a.status === 0 || a.status >= 500)}>No timeouts, 5xx or lost requests under contention</Verdict>
                  {result.duplicates ? (
                    <Verdict pass={result.duplicates.rejected === result.duplicates.attempted}>
                      Duplicate enrollments rejected by the unique constraint ({result.duplicates.rejected}/{result.duplicates.attempted})
                    </Verdict>
                  ) : <Verdict pass={false} pending>Checking duplicate enrollments…</Verdict>}
                  {result.replay && (
                    <Verdict pass={result.replay.sameEnrollment && result.replay.replayedHeader}>
                      A retried request with the same Idempotency-Key returned the original response (<code>Idempotent-Replayed: true</code>)
                    </Verdict>
                  )}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {codes && Object.entries(codes).map(([code, n]) => (
                    <span key={code} className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-zinc-700">{code}: {n}</span>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-zinc-200 p-4">
                  <p className="mb-3 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Background fan-out</p>
                  {result.background ? (
                    <ul className="space-y-1.5">
                      <Verdict pass={result.background.delivered === result.background.expected}>
                        {result.background.delivered}/{result.background.expected} welcome notifications written by the notification consumer
                      </Verdict>
                      <Verdict pass={!result.background.timedOut}>
                        {result.background.ms != null ? `All delivered ${fmt.ms(result.background.ms)} after the rush — off the request path` : 'Not all delivered within 60 s'}
                      </Verdict>
                    </ul>
                  ) : <ul><Verdict pass={false} pending>Waiting for consumers…</Verdict></ul>}
                </div>
                <div className="rounded-xl border border-zinc-200 p-4">
                  <p className="mb-3 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Cross-service consistency</p>
                  {result.consistency ? (
                    <ul className="space-y-1.5">
                      <Verdict pass={result.consistency.roster === result.winners}>learning roster = {result.consistency.roster} (source of truth)</Verdict>
                      <Verdict pass={result.consistency.analytics === result.winners}>
                        analytics projection (current enrollments) = {result.consistency.analytics}, as of {result.consistency.asOf ? timeAgo(result.consistency.asOf) : '—'}
                      </Verdict>
                      {result.consistency.analytics !== result.winners && (
                        <li className="text-xs text-zinc-500">The projection is eventually consistent and cached up to 5 min; its <code>as_of</code> shows exactly how far behind it is.</li>
                      )}
                    </ul>
                  ) : <ul><Verdict pass={false} pending>Comparing services…</Verdict></ul>}
                </div>
              </div>

              <details className="rounded-xl border border-zinc-200">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-700">Per-request log ({result.attempts.length})</summary>
                <div className="max-h-72 overflow-y-auto border-t border-zinc-100">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white text-left text-zinc-500">
                      <tr><th className="px-4 py-2 font-medium">Student</th><th className="px-4 py-2 font-medium">HTTP</th><th className="px-4 py-2 font-medium">Outcome</th><th className="px-4 py-2 font-medium">Latency</th><th className="px-4 py-2 font-medium">request_id</th></tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 font-mono">
                      {result.attempts.map((a) => (
                        <tr key={a.student}><td className="px-4 py-1.5 font-sans">{a.student}</td><td className="px-4 py-1.5">{a.status}</td><td className="px-4 py-1.5">{a.code}</td><td className="px-4 py-1.5">{fmt.ms(a.ms)}</td><td className="px-4 py-1.5 text-zinc-400">{a.requestId ?? '—'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <Link to={`/courses/${result.courseId}`} className="inline-block text-xs text-brand-600 hover:text-brand-700">Open “{result.title}” →</Link>
            </>
          )}
        </div>
      </div>
    </ScenarioSection>
  )
}
