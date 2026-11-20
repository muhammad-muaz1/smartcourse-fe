import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Download,
  Eye,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Paperclip,
  Presentation,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Skeleton, Spinner } from '@/components/ui/primitives'
import { coursesApi, lessonAssetsQuery } from '@/features/courses/api'
import { errorMessage } from '@/lib/api/client'
import type { Asset } from '@/lib/api/types'
import { fileExtension, formatBytes, previewOf, saveBlob } from '@/lib/files'

const ICONS: [string[], LucideIcon][] = [
  [['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md'], FileText],
  [['xls', 'xlsx', 'ods', 'csv'], FileSpreadsheet],
  [['ppt', 'pptx', 'odp', 'key'], Presentation],
  [['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'], FileImage],
  [['mp4', 'webm', 'ogv', 'mov', 'mkv'], FileVideo],
  [['mp3', 'wav', 'ogg', 'm4a'], FileAudio],
  [['zip', 'rar', '7z', 'tar', 'gz'], FileArchive],
]

function iconFor(filename: string): LucideIcon {
  const ext = fileExtension(filename)
  return ICONS.find(([exts]) => exts.includes(ext))?.[1] ?? File
}

/**
 * Fetch an asset's bytes with the session token and expose them as an object URL typed to
 * our allow-listed MIME (the API serves files as attachments, so a plain link would only
 * download). Text files are also returned as a string for a <pre> view.
 */
function useAssetPreview(asset: Asset, mime: string, asText: boolean) {
  const [state, setState] = useState<{ url?: string; text?: string; error?: unknown }>({})
  useEffect(() => {
    let cancelled = false
    let url: string | undefined
    coursesApi
      .downloadAsset(asset)
      .then(async (raw) => {
        if (cancelled) return
        if (asText) {
          const text = await raw.text()
          if (!cancelled) setState({ text })
          return
        }
        url = URL.createObjectURL(new Blob([raw], { type: mime }))
        setState({ url })
      })
      .catch((error: unknown) => !cancelled && setState({ error }))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [asset, mime, asText])
  return state
}

function PreviewContent({ asset }: { asset: Asset }) {
  const preview = previewOf(asset)!
  const { url, text, error } = useAssetPreview(asset, preview.mime, preview.kind === 'text')

  if (error) return <p className="py-10 text-center text-sm text-rose-600">Couldn't load preview: {errorMessage(error)}</p>
  if (!url && text === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner label="Loading preview" />
      </div>
    )
  }

  switch (preview.kind) {
    case 'pdf':
      return <iframe src={url} title={asset.filename} className="h-[75dvh] w-full rounded-lg border border-zinc-200" />
    case 'image':
      return <img src={url} alt={asset.filename} className="mx-auto max-h-[75dvh] rounded-lg object-contain" />
    case 'video':
      return <video src={url} controls className="max-h-[75dvh] w-full rounded-lg bg-zinc-900" />
    case 'audio':
      return <audio src={url} controls className="w-full" />
    case 'text':
      return (
        <pre className="max-h-[75dvh] overflow-auto rounded-lg bg-zinc-50 p-4 text-xs leading-relaxed whitespace-pre-wrap text-zinc-800">
          {text}
        </pre>
      )
  }
}

/** A lesson's attachments for learners: preview what the browser can show, download anything. */
export function LessonAttachments({ lessonId }: { lessonId: string }) {
  const assets = useQuery(lessonAssetsQuery(lessonId))
  const [previewing, setPreviewing] = useState<Asset | null>(null)
  const download = useMutation({
    mutationFn: async (asset: Asset) => saveBlob(await coursesApi.downloadAsset(asset), asset.filename),
  })

  if (assets.isPending) return <Skeleton className="mt-8 h-16" />
  if (assets.isError) {
    return (
      <p className="mt-8 text-sm text-zinc-500">
        Couldn't load attachments.{' '}
        <button className="underline hover:text-zinc-800" onClick={() => void assets.refetch()}>
          Retry
        </button>
      </p>
    )
  }
  if (!assets.data.length) return null

  return (
    <section className="mt-10 border-t border-zinc-100 pt-6" aria-labelledby="attachments-heading">
      <h2 id="attachments-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-800">
        <Paperclip className="size-4" /> Attachments
        <span className="font-normal text-zinc-400">({assets.data.length})</span>
      </h2>
      <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
        {assets.data.map((asset) => {
          const Icon = iconFor(asset.filename)
          const canPreview = previewOf(asset) !== null
          return (
            <li key={asset.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <Icon className="size-4 shrink-0 text-zinc-400" />
              {canPreview ? (
                <button className="flex-1 truncate text-left hover:text-brand-700 hover:underline" onClick={() => setPreviewing(asset)}>
                  {asset.filename}
                </button>
              ) : (
                <span className="flex-1 truncate">{asset.filename}</span>
              )}
              <span className="text-xs text-zinc-400 tabular-nums">{formatBytes(asset.size_bytes)}</span>
              {canPreview && (
                <Button variant="ghost" size="icon" aria-label={`Preview ${asset.filename}`} onClick={() => setPreviewing(asset)}>
                  <Eye className="size-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Download ${asset.filename}`}
                loading={download.isPending && download.variables?.id === asset.id}
                onClick={() => download.mutate(asset)}
              >
                <Download className="size-3.5" />
              </Button>
            </li>
          )
        })}
      </ul>

      <Modal
        open={previewing !== null}
        onClose={() => setPreviewing(null)}
        title={previewing?.filename ?? ''}
        description={previewing ? formatBytes(previewing.size_bytes) : undefined}
        className="max-w-4xl"
      >
        {previewing && (
          <div className="space-y-4">
            <PreviewContent key={previewing.id} asset={previewing} />
            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                icon={<Download className="size-4" />}
                loading={download.isPending && download.variables?.id === previewing.id}
                onClick={() => download.mutate(previewing)}
              >
                Download
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}
