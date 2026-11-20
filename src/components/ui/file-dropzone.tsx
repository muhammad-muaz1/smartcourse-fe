import { FileText, Film, UploadCloud, X } from 'lucide-react'
import { useId, useState, type DragEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'] as const

function formatBytes(bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${SIZE_UNITS[unit]}`
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

/**
 * Drag-and-drop file picker with client-side type and size validation. It only *selects*
 * files; the parent decides what to do with them (the content service's upload endpoints
 * are not live yet, so lesson forms stage files and say so).
 */
export function FileDropzone({
  label,
  extensions,
  maxBytes,
  multiple = false,
  files,
  onChange,
  note,
  kind = 'document',
  formatsLabel,
}: {
  label: string
  /** Lower-case extensions including the dot, e.g. ['.pdf', '.docx']. */
  extensions: string[]
  maxBytes: number
  multiple?: boolean
  files: File[]
  onChange: (files: File[]) => void
  note?: ReactNode
  kind?: 'document' | 'video'
  /** Human summary of accepted formats, for when listing every extension would be too long. */
  formatsLabel?: string
}) {
  const id = useId()
  const [dragging, setDragging] = useState(false)
  const [rejected, setRejected] = useState<string[]>([])

  function accept(incoming: FileList | null) {
    if (!incoming) return
    const ok: File[] = []
    const bad: string[] = []
    for (const file of incoming) {
      if (!extensions.includes(extensionOf(file.name))) bad.push(`${file.name}: unsupported type`)
      else if (file.size > maxBytes) bad.push(`${file.name}: larger than ${formatBytes(maxBytes)}`)
      else ok.push(file)
    }
    setRejected(bad)
    onChange(multiple ? [...files, ...ok] : ok.slice(0, 1))
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    accept(event.dataTransfer.files)
  }

  const Icon = kind === 'video' ? Film : FileText
  const formats = formatsLabel ?? extensions.map((e) => e.slice(1).toUpperCase()).join(', ')

  return (
    <div className="space-y-2">
      <span className="block text-xs font-medium text-zinc-700">{label}</span>
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-6 py-6 text-center transition',
          dragging ? 'border-brand-400 bg-brand-50' : 'border-zinc-200 bg-zinc-50/60 hover:border-zinc-300 hover:bg-zinc-50',
        )}
      >
        <UploadCloud className={cn('size-6', dragging ? 'text-brand-500' : 'text-zinc-400')} />
        <span className="text-sm text-zinc-700">
          <span className="font-medium text-brand-600">Click to upload</span> or drag and drop
        </span>
        <span className="text-xs text-zinc-500">
          Supported: {formats} · up to {formatBytes(maxBytes)}
          {multiple && ' each'}
        </span>
        <input
          id={id}
          type="file"
          className="sr-only"
          multiple={multiple}
          accept={extensions.join(',')}
          onChange={(e) => {
            accept(e.target.files)
            e.target.value = ''
          }}
        />
      </label>
      {rejected.length > 0 && (
        <ul className="space-y-0.5 text-xs text-rose-600" role="alert">
          {rejected.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="flex items-center gap-2.5 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-zinc-200">
              <Icon className="size-4 shrink-0 text-zinc-400" />
              <span className="min-w-0 flex-1 truncate text-zinc-800">{file.name}</span>
              <span className="text-xs text-zinc-400">{formatBytes(file.size)}</span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                aria-label={`Remove ${file.name}`}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="text-xs text-zinc-500">{note}</p>}
    </div>
  )
}
