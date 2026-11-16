import { useCallback, useRef, useState } from 'react'
import { errorMessage } from '@/lib/api/client'

export type StepState = 'idle' | 'running' | 'done' | 'failed' | 'skipped'

export interface Step {
  id: string
  label: string
  state: StepState
  detail?: string
  startedAt?: number
  finishedAt?: number
}

/**
 * Tiny state machine for a multi-step scenario: ordered steps, one AbortController
 * per run, and `step(id, fn)` that marks running/done/failed around an async body.
 */
export function useSteps(definition: { id: string; label: string }[]) {
  const initial = useCallback(() => definition.map((d) => ({ ...d, state: 'idle' as StepState })), [definition])
  const [steps, setSteps] = useState<Step[]>(initial)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)

  const patch = useCallback((id: string, update: Partial<Step>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...update } : s)))
  }, [])

  const step = useCallback(
    async <T,>(id: string, body: (detail: (text: string) => void) => Promise<T>): Promise<T> => {
      patch(id, { state: 'running', startedAt: performance.now(), detail: undefined })
      try {
        const result = await body((text) => patch(id, { detail: text }))
        patch(id, { state: 'done', finishedAt: performance.now() })
        return result
      } catch (e) {
        patch(id, { state: 'failed', finishedAt: performance.now(), detail: errorMessage(e) })
        throw e
      }
    },
    [patch],
  )

  /** Run a scenario body; returns its signal-aware lifecycle. */
  const run = useCallback(
    async (body: (signal: AbortSignal) => Promise<void>) => {
      controller.current?.abort()
      const ctrl = new AbortController()
      controller.current = ctrl
      setSteps(initial())
      setError(null)
      setRunning(true)
      try {
        await body(ctrl.signal)
      } catch (e) {
        if (!ctrl.signal.aborted) setError(errorMessage(e))
        setSteps((prev) => prev.map((s) => (s.state === 'idle' ? { ...s, state: 'skipped' } : s)))
      } finally {
        setRunning(false)
      }
    },
    [initial],
  )

  const cancel = useCallback(() => controller.current?.abort(new DOMException('Cancelled', 'AbortError')), [])

  return { steps, running, error, step, run, cancel, patch }
}
