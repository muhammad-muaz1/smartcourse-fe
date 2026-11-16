import { describe, expect, it } from 'vitest'
import { fmt, plural, timeAgo } from './utils'

describe('date formatting', () => {
  // Regression: gateway /version reports build_time "unknown" in local builds, which
  // used to throw RangeError and crash the demo page.
  it('passes unparseable values through instead of throwing', () => {
    expect(fmt.dateTime('unknown')).toBe('unknown')
    expect(fmt.time('unknown')).toBe('unknown')
    expect(timeAgo('unknown')).toBe('unknown')
  })

  it('renders a dash for missing values', () => {
    expect(fmt.dateTime(null)).toBe('—')
    expect(timeAgo(undefined)).toBe('—')
  })
})

describe('plural', () => {
  it('only pluralises counts other than one', () => {
    expect(plural(1, 'module')).toBe('1 module')
    expect(plural(0, 'lesson')).toBe('0 lessons')
    expect(plural(3, 'lesson')).toBe('3 lessons')
  })
})
