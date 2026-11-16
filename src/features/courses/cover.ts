const GRADIENTS = [
  'from-indigo-500 to-violet-500',
  'from-sky-500 to-indigo-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-rose-500',
  'from-fuchsia-500 to-pink-500',
  'from-cyan-500 to-blue-600',
]

/** Deterministic cover per course until the content service serves real cover assets. */
export function coverGradient(id: string): string {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]!
}
