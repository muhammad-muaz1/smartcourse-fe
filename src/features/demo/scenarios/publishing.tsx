import { Play, Square } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PublishRunTimeline } from '@/features/courses/publish-run-timeline'
import { api, newIdempotencyKey } from '@/lib/api/client'
import type { CourseDetail, PublishRun } from '@/lib/api/types'
import { fmt } from '@/lib/utils'
import { ErrorBanner, Metric, ScenarioSection, StepList, Verdict } from '../components'
import { ensureCohort, signInCohort } from '../lib/cohort'
import { createDemoCourse, startPublish, waitForRun } from '../lib/fixtures'
import { useSteps } from '../lib/use-steps'

const STEPS = [
  { id: 'actor', label: 'Sign in as the demo instructor' },
  { id: 'publish', label: 'Publish a course with one click (double-clicked on purpose)' },
  { id: 'fault', label: 'Publish a broken course — a module with no lessons' },
  { id: 'recover', label: 'Fix the content and republish' },
]

interface Result {
  happy?: PublishRun
  clickToLiveMs?: number
  liveStatus?: string
  doubleClick?: { sameRun: boolean; replayed: boolean }
  fault?: PublishRun
  faultStatus?: string
  recovered?: PublishRun
  recoveredStatus?: string
}

export function PublishingScenario() {
  const [result, setResult] = useState<Result>({})
  const { steps, running, error, step, run, cancel } = useSteps(STEPS)
  const update = (patch: Partial<Result>) => setResult((prev) => ({ ...prev, ...patch }))

  const start = () =>
    run(async (signal) => {
      setResult({})
      const { instructor } = await step('actor', async () => {
        await ensureCohort(0, () => undefined, signal)
        return signInCohort(0, () => undefined, signal)
      })
      const token = instructor.token
      const getCourse = (id: string) => api.get<CourseDetail>(`/courses/${id}`, { token, signal })

      await step('publish', async (detail) => {
        const course = await createDemoCourse(token, { title: `Publishing saga · ${new Date().toLocaleTimeString()}`, seats: null })
        const key = newIdempotencyKey()
        const t0 = performance.now()
        // Two identical clicks, same Idempotency-Key, fired together.
        const [a, b] = await Promise.allSettled([startPublish(course.id, token, key), startPublish(course.id, token, key)])
        const first = a.status === 'fulfilled' ? a.value : b.status === 'fulfilled' ? b.value : null
        if (!first) throw a.status === 'rejected' ? a.reason : new Error('Publish request failed')
        // The losing click either replays the stored 202 or is told the first is still in flight (409).
        const second = a.status === 'fulfilled' && b.status === 'fulfilled' ? b.value : null
        const retry = second ?? (await startPublish(course.id, token, key))
        update({ doubleClick: { sameRun: retry.data.id === first.data.id, replayed: retry.replayed } })

        const finished = await waitForRun(course.id, first.data.id, token, signal, (live) => update({ happy: live }))
        const clickToLiveMs = performance.now() - t0
        const live = await getCourse(course.id)
        update({ happy: finished, clickToLiveMs, liveStatus: live.status })
        if (finished.status !== 'succeeded') throw new Error(`Publish failed: ${finished.error}`)
        detail(`Live in the catalogue ${fmt.ms(clickToLiveMs)} after the click`)
      })

      const broken = await step('fault', async (detail) => {
        const course = await createDemoCourse(token, { title: `Broken course · ${new Date().toLocaleTimeString()}`, seats: null, withEmptyModule: true })
        const { data: started } = await startPublish(course.id, token)
        const finished = await waitForRun(course.id, started.id, token, signal, (live) => update({ fault: live }))
        const after = await getCourse(course.id)
        update({ fault: finished, faultStatus: after.status })
        detail(`Run ${finished.status} at “${finished.failed_step ?? '—'}”; course is now ${after.status}`)
        return after
      })

      await step('recover', async (detail) => {
        const empty = broken.modules.find((m) => m.lessons.length === 0)
        if (empty) {
          await api.post(`/modules/${empty.id}/lessons`, { title: 'Added after the failure', lesson_type: 'text', body: { content: 'Recovered.' }, duration_minutes: 1 }, { token })
        }
        const { data: started } = await startPublish(broken.id, token)
        const finished = await waitForRun(broken.id, started.id, token, signal, (live) => update({ recovered: live }))
        const after = await getCourse(broken.id)
        update({ recovered: finished, recoveredStatus: after.status })
        detail(`Republished: ${after.status}`)
      })
    })

  return (
    <ScenarioSection
      id="publishing"
      number={1}
      problem="Slow and manual content publishing workflows"
      title="One-click publishing saga, with fault injection"
      mechanism={
        <>
          Publishing is a <strong>Temporal workflow</strong> owned by the course service: each step is a durable, retried activity, and a failure
          runs compensation — the course rolls back to <code>failed</code>, records the failing step, and nothing half-processed reaches the
          catalogue. The publish request itself is idempotent, so an impatient double-click starts exactly one workflow.
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          {running ? (
            <Button variant="danger" icon={<Square className="size-4" />} onClick={cancel}>Cancel</Button>
          ) : (
            <Button icon={<Play className="size-4" />} onClick={() => void start()}>Run publishing scenario</Button>
          )}
          <StepList steps={steps} />
          <ErrorBanner message={error} />
        </div>

        <div className="space-y-5">
          {!result.happy ? (
            <div className="grid h-full min-h-48 place-items-center rounded-xl border border-dashed border-zinc-200 text-sm text-zinc-400">
              Workflow runs stream in here, step by step.
            </div>
          ) : (
            <>
              {result.clickToLiveMs != null && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Metric label="Click → live in catalogue" value={fmt.ms(result.clickToLiveMs)} sub="no manual steps" />
                  <Metric label="Workflow runs" value={[result.happy, result.fault, result.recovered].filter(Boolean).length} />
                  <Metric label="Steps per run" value={result.happy.steps.length} />
                </div>
              )}
              <div>
                <p className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Happy path</p>
                <PublishRunTimeline run={result.happy} compact />
              </div>
              {result.fault && (
                <div>
                  <p className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Injected failure</p>
                  <PublishRunTimeline run={result.fault} compact />
                </div>
              )}
              {result.recovered && (
                <div>
                  <p className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">After the fix</p>
                  <PublishRunTimeline run={result.recovered} compact />
                </div>
              )}
              <ul className="space-y-1.5 rounded-xl border border-zinc-200 p-4">
                {result.doubleClick && (
                  <Verdict pass={result.doubleClick.sameRun}>
                    Double-click started one workflow, not two (same run id{result.doubleClick.replayed ? ', response replayed' : ''})
                  </Verdict>
                )}
                {result.liveStatus && <Verdict pass={result.liveStatus === 'published'}>Course reached <code>published</code> automatically</Verdict>}
                {result.faultStatus && (
                  <>
                    <Verdict pass={result.fault?.status === 'failed' && !!result.fault.failed_step}>
                      Failure detected and attributed to step <code>{result.fault?.failed_step ?? '—'}</code>
                    </Verdict>
                    <Verdict pass={result.faultStatus === 'failed'}>
                      Compensation rolled the course back to <code>failed</code> — never half-published (got <code>{result.faultStatus}</code>)
                    </Verdict>
                  </>
                )}
                {result.recoveredStatus && (
                  <Verdict pass={result.recoveredStatus === 'published'}>Recovered: the same course republished cleanly after the fix</Verdict>
                )}
              </ul>
            </>
          )}
        </div>
      </div>
    </ScenarioSection>
  )
}
