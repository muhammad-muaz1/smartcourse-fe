export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

/** Save a fetched Blob to disk under the given name. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

/** How a file can be shown in the browser; `null` means download only. */
export type PreviewKind = 'pdf' | 'image' | 'video' | 'audio' | 'text'

/**
 * Allow-list of previewable formats, keyed by extension, with the MIME type the preview
 * blob is re-typed to. The server's Content-Type is only a hint: anything not listed here
 * (notably HTML, which would run script in our origin) is never rendered inline.
 */
const PREVIEWABLE: Record<string, { kind: PreviewKind; mime: string }> = {
  pdf: { kind: 'pdf', mime: 'application/pdf' },
  png: { kind: 'image', mime: 'image/png' },
  jpg: { kind: 'image', mime: 'image/jpeg' },
  jpeg: { kind: 'image', mime: 'image/jpeg' },
  gif: { kind: 'image', mime: 'image/gif' },
  webp: { kind: 'image', mime: 'image/webp' },
  avif: { kind: 'image', mime: 'image/avif' },
  svg: { kind: 'image', mime: 'image/svg+xml' }, // rendered via <img>, so scripts never run
  mp4: { kind: 'video', mime: 'video/mp4' },
  webm: { kind: 'video', mime: 'video/webm' },
  ogv: { kind: 'video', mime: 'video/ogg' },
  mov: { kind: 'video', mime: 'video/quicktime' },
  mp3: { kind: 'audio', mime: 'audio/mpeg' },
  wav: { kind: 'audio', mime: 'audio/wav' },
  ogg: { kind: 'audio', mime: 'audio/ogg' },
  m4a: { kind: 'audio', mime: 'audio/mp4' },
  txt: { kind: 'text', mime: 'text/plain' },
  md: { kind: 'text', mime: 'text/plain' },
  csv: { kind: 'text', mime: 'text/plain' },
  json: { kind: 'text', mime: 'text/plain' },
  log: { kind: 'text', mime: 'text/plain' },
}

/** Past these sizes a preview would pull too much into memory; offer download instead. */
const PREVIEW_LIMIT: Record<PreviewKind, number> = {
  pdf: 50 * 1024 ** 2,
  image: 25 * 1024 ** 2,
  video: 200 * 1024 ** 2,
  audio: 100 * 1024 ** 2,
  text: 2 * 1024 ** 2,
}

export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : ''
}

export function previewOf(file: { filename: string; size_bytes: number }): { kind: PreviewKind; mime: string } | null {
  const match = PREVIEWABLE[fileExtension(file.filename)]
  if (!match || file.size_bytes > PREVIEW_LIMIT[match.kind]) return null
  return match
}
