import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const dateTime = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })
const timeOnly = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const shortDate = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })
const integer = new Intl.NumberFormat('en')
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

/** Formats an ISO timestamp; anything unparseable (e.g. "unknown") is shown as-is, never thrown. */
function formatDate(format: Intl.DateTimeFormat, iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : format.format(date)
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
]

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return iso
  const seconds = (time - Date.now()) / 1000
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

export const fmt = {
  dateTime: (iso: string | null | undefined) => formatDate(dateTime, iso),
  time: (iso: string | null | undefined) => formatDate(timeOnly, iso),
  shortDate: (iso: string) => shortDate.format(new Date(iso)),
  int: (n: number) => integer.format(n),
  compact: (n: number) => compact.format(n),
  pct: (ratio: number, digits = 1) => `${(ratio * 100).toFixed(digits)}%`,
  ms: (ms: number) =>
    ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(ms < 10 ? 1 : 0)} ms`,
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason as Error)
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason as Error)
      },
      { once: true },
    )
  })
}

/** Milliseconds between two ISO timestamps, or null when either is missing. */
export function durationBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  return new Date(end).getTime() - new Date(start).getTime()
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}
