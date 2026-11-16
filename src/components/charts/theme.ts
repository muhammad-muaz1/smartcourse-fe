/**
 * Chart tokens. Categorical slots are assigned in fixed order and never cycled; the
 * pair below was run through the palette validator (CVD + contrast on #fcfcfb) and
 * passes. The app ships light-only today; a dark theme needs its own validated steps.
 */
export const chart = {
  series1: '#2a78d6',
  series2: '#eb6834',
  surface: '#fcfcfb',
  grid: '#ececea',
  axis: '#8a8984',
  textPrimary: '#0b0b0b',
  textSecondary: '#52514e',
  fontSize: 11,
} as const

export const axisProps = {
  stroke: chart.axis,
  tick: { fill: chart.textSecondary, fontSize: chart.fontSize },
  tickLine: false,
  axisLine: false,
} as const

export const tooltipStyle = {
  contentStyle: {
    borderRadius: 8,
    border: '1px solid #e4e4e7',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    fontSize: 12,
    color: chart.textPrimary,
  },
  labelStyle: { color: chart.textSecondary, marginBottom: 4 },
} as const
