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

/**
 * Lesson attachment formats, by group (no dot, lower-case). Must match the course
 * service's ALLOWED_EXTENSIONS (smartcourse-core assets/service.py), which is the real gate.
 */
export const ATTACHMENT_GROUPS = {
  document: ['pdf', 'doc', 'docx', 'dot', 'dotx', 'odt', 'rtf', 'txt', 'md', 'pages', 'epub', 'json', 'xml', 'log'],
  spreadsheet: ['xls', 'xlsx', 'ods', 'csv', 'tsv', 'numbers'],
  presentation: ['ppt', 'pptx', 'pps', 'ppsx', 'odp', 'key'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico', 'tif', 'tiff', 'heic', 'heif'],
  archive: ['zip'],
} as const

export type AttachmentGroup = keyof typeof ATTACHMENT_GROUPS

/** Dotted form for the dropzone, e.g. ['.pdf', '.docx', …]. */
export const ATTACHMENT_EXTENSIONS: string[] = Object.values(ATTACHMENT_GROUPS).flatMap((exts) =>
  exts.map((ext) => `.${ext}`),
)

export function attachmentGroup(filename: string): AttachmentGroup | null {
  const ext = fileExtension(filename)
  for (const [group, exts] of Object.entries(ATTACHMENT_GROUPS)) {
    if ((exts as readonly string[]).includes(ext)) return group as AttachmentGroup
  }
  return null
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
  bmp: { kind: 'image', mime: 'image/bmp' },
  ico: { kind: 'image', mime: 'image/x-icon' },
  // tif/tiff/heic/heif are accepted but download-only: most browsers can't render them.
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
  tsv: { kind: 'text', mime: 'text/plain' },
  json: { kind: 'text', mime: 'text/plain' },
  xml: { kind: 'text', mime: 'text/plain' }, // shown as source in a <pre>, never parsed
  log: { kind: 'text', mime: 'text/plain' },
}

/** Preview kind by extension, ignoring size (for icons and labels). */
export const PREVIEWABLE_KIND: Record<string, PreviewKind | undefined> = Object.fromEntries(
  Object.entries(PREVIEWABLE).map(([ext, { kind }]) => [ext, kind]),
)

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
