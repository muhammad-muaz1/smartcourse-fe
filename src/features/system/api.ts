import { queryOptions } from '@tanstack/react-query'
import { ApiError } from '@/lib/api/client'
import type { HealthReport } from '@/lib/api/types'

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''

export interface HealthSnapshot {
  report: HealthReport
  latencyMs: number
}

/**
 * Gateway /health aggregates every service behind it (outside /api/v1, no envelope).
 * A degraded platform answers 503 with the same body — exactly the case worth
 * rendering — so a 503 is data here, not an error.
 */
async function fetchHealth(signal?: AbortSignal): Promise<HealthSnapshot> {
  const started = performance.now()
  let response: Response
  try {
    response = await fetch(`${API_BASE}/health`, { signal, headers: { Accept: 'application/json' } })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, {}, 'Gateway unreachable')
  }
  if (!response.ok && response.status !== 503) {
    throw new ApiError(response.status, {}, `Health check failed (${response.status})`)
  }
  return {
    report: (await response.json()) as HealthReport,
    latencyMs: performance.now() - started,
  }
}

export const healthQuery = (refetchInterval: number | false = 10_000) =>
  queryOptions({
    queryKey: ['system', 'health'],
    queryFn: ({ signal }) => fetchHealth(signal),
    refetchInterval,
    staleTime: 5_000,
    retry: false,
  })

export interface VersionInfo {
  service: string
  version: string
  build_time: string
}

/** Gateway build identity (git SHA + build time). Touches no dependency, so it answers even when /health doesn't. */
export const versionQuery = () =>
  queryOptions({
    queryKey: ['system', 'version'],
    queryFn: async ({ signal }) => {
      const response = await fetch(`${API_BASE}/version`, { signal, headers: { Accept: 'application/json' } })
      if (!response.ok) throw new ApiError(response.status, {}, `Version check failed (${response.status})`)
      return (await response.json()) as VersionInfo
    },
    staleTime: Infinity,
  })
