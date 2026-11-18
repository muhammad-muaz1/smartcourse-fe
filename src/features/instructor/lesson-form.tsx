import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Info, Paperclip, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { courseKeys, coursesApi, lessonAssetsQuery } from '@/features/courses/api'
import { Button } from '@/components/ui/button'
import { FileDropzone } from '@/components/ui/file-dropzone'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { errorMessage } from '@/lib/api/client'
import type { Asset, Lesson, LessonInput } from '@/lib/api/types'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

/** Save a fetched Blob to disk under the asset's original name. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.mkv']
const DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.md', '.csv', '.zip']
const GB = 1024 ** 3
const MB = 1024 ** 2

// One flat form, narrowed per lesson type on submit — mirrors the backend's jsonb body
// discriminated by lesson_type (TextLessonBody / VideoLessonBody).
const schema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(255),
    lesson_type: z.enum(['text', 'video']),
    duration: z.string().trim().refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) <= 10_000), 'Minutes, 0–10000'),
    content: z.string().max(200_000),
    video_url: z.string().trim(),
    transcript: z.string().max(200_000),
  })
  .superRefine((v, ctx) => {
    if (v.lesson_type === 'text' && !v.content.trim()) {
      ctx.addIssue({ code: 'custom', path: ['content'], message: 'Lesson content is required' })
    }
    if (v.lesson_type === 'video' && !z.url().safeParse(v.video_url).success) {
      ctx.addIssue({ code: 'custom', path: ['video_url'], message: 'Enter a valid video URL' })
    }
  })
type FormValues = z.infer<typeof schema>

function toInput(v: FormValues): LessonInput {
  return {
    title: v.title,
    lesson_type: v.lesson_type,
    duration_minutes: v.duration ? Number(v.duration) : null,
    body:
      v.lesson_type === 'text'
        ? { content: v.content }
        : { video_url: v.video_url, ...(v.transcript.trim() ? { transcript: v.transcript } : {}) },
  }
}

function toValues(lesson?: Lesson): FormValues {
  const body = lesson?.body
  return {
    title: lesson?.title ?? '',
    lesson_type: lesson?.lesson_type ?? 'text',
    duration: lesson?.duration_minutes != null ? String(lesson.duration_minutes) : '',
    content: body && 'content' in body ? body.content : '',
    video_url: body && 'video_url' in body ? body.video_url : '',
    transcript: body && 'video_url' in body ? (body.transcript ?? '') : '',
  }
}

const UPLOAD_NOTE = (
  <span className="flex items-start gap-1.5">
    <Info className="mt-0.5 size-3.5 shrink-0" />
    <span>Uploaded to object storage when you save the lesson. Large videos: link by URL instead.</span>
  </span>
)

/** Existing attachments for a saved lesson: list, download, remove. Shown only when
 *  editing (a new lesson has no id to hang assets off until its first save). */
function ExistingAttachments({ lessonId }: { lessonId: string }) {
  const queryClient = useQueryClient()
  const assets = useQuery(lessonAssetsQuery(lessonId))
  const download = useMutation({
    mutationFn: async (asset: Asset) => saveBlob(await coursesApi.downloadAsset(asset), asset.filename),
  })
  const remove = useMutation({
    mutationFn: (assetId: string) => coursesApi.deleteAsset(assetId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: courseKeys.lessonAssets(lessonId) }),
    meta: { successMessage: 'Attachment removed' },
  })
  const items = assets.data ?? []
  if (!items.length) return null
  return (
    <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {items.map((asset) => (
        <li key={asset.id} className="flex items-center gap-3 px-3 py-2 text-sm">
          <Paperclip className="size-4 shrink-0 text-zinc-400" />
          <span className="flex-1 truncate">{asset.filename}</span>
          <span className="text-xs text-zinc-400">{formatBytes(asset.size_bytes)}</span>
          <Button variant="ghost" size="icon" aria-label={`Download ${asset.filename}`} loading={download.isPending && download.variables?.id === asset.id} onClick={() => download.mutate(asset)}>
            <Download className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={`Remove ${asset.filename}`} loading={remove.isPending && remove.variables === asset.id} onClick={() => remove.mutate(asset.id)}>
            <Trash2 className="size-3.5 text-rose-500" />
          </Button>
        </li>
      ))}
    </ul>
  )
}

export function LessonForm({
  initial,
  submitLabel = 'Add lesson',
  courseId,
  onSubmit,
  onComplete,
}: {
  initial?: Lesson
  submitLabel?: string
  courseId: string
  /** Saves the lesson and resolves to it, so staged files can be attached to its id. */
  onSubmit: (input: LessonInput) => Promise<Lesson>
  /** Called after the lesson and its attachments are saved (e.g. to close the dialog). */
  onComplete?: () => void
}) {
  const queryClient = useQueryClient()
  const [videoFile, setVideoFile] = useState<File[]>([])
  const [attachments, setAttachments] = useState<File[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toValues(initial) })
  const type = useWatch({ control, name: 'lesson_type' })

  const submit = handleSubmit(async (values) => {
    setUploadError(null)
    try {
      const lesson = await onSubmit(toInput(values))
      // The lesson is saved; now upload the staged attachments against its id. Done one
      // at a time so a failure names the file that failed and the rest are left staged.
      const remaining: File[] = []
      for (const file of attachments) {
        try {
          await coursesApi.uploadAsset(file, { courseId, lessonId: lesson.id })
        } catch (error) {
          remaining.push(file)
          setUploadError(`${file.name}: ${errorMessage(error)}`)
        }
      }
      setAttachments(remaining)
      if (attachments.length) {
        await queryClient.invalidateQueries({ queryKey: courseKeys.lessonAssets(lesson.id) })
      }
      if (remaining.length) return // keep the form open so the user can retry
      if (!initial) {
        reset()
        setVideoFile([])
      }
      onComplete?.()
    } catch {
      // Lesson save failed — surfaced by the global mutation toast. Keep the form.
    }
  })

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="grid grid-cols-[1fr_140px_110px] gap-3">
        <Field label="Title" error={errors.title?.message}>
          {(a) => <Input autoFocus {...a} {...register('title')} />}
        </Field>
        <Field label="Type">
          {(a) => (
            <Select {...a} {...register('lesson_type')}>
              <option value="text">Text</option>
              <option value="video">Video</option>
            </Select>
          )}
        </Field>
        <Field label="Minutes" error={errors.duration?.message}>
          {(a) => <Input inputMode="numeric" {...a} {...register('duration')} />}
        </Field>
      </div>

      {type === 'text' ? (
        <Field label="Content (Markdown)" error={errors.content?.message}>
          {(a) => <Textarea rows={8} className="font-mono text-[13px]" {...a} {...register('content')} />}
        </Field>
      ) : (
        <>
          <FileDropzone
            label="Upload video"
            kind="video"
            extensions={VIDEO_EXTENSIONS}
            maxBytes={2 * GB}
            files={videoFile}
            onChange={setVideoFile}
          />
          <Field label="…or video URL" error={errors.video_url?.message} hint="YouTube links and direct MP4/WebM files play inline.">
            {(a) => <Input type="url" placeholder="https://…" {...a} {...register('video_url')} />}
          </Field>
          <Field label="Transcript (optional)" error={errors.transcript?.message}>
            {(a) => <Textarea rows={4} {...a} {...register('transcript')} />}
          </Field>
        </>
      )}

      <div className="space-y-2">
        {initial && <ExistingAttachments lessonId={initial.id} />}
        <FileDropzone
          label="Attachments (optional)"
          extensions={DOCUMENT_EXTENSIONS}
          maxBytes={50 * MB}
          multiple
          files={attachments}
          onChange={setAttachments}
          note={UPLOAD_NOTE}
        />
        {uploadError && <p className="text-sm text-rose-600 dark:text-rose-400">{uploadError}</p>}
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting} disabled={!!initial && !isDirty && attachments.length === 0}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
