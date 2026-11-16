import { zodResolver } from '@hookform/resolvers/zod'
import { Info } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { FileDropzone } from '@/components/ui/file-dropzone'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import type { Lesson, LessonInput } from '@/lib/api/types'

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
    <span>
      Files are staged here. They&apos;re sent once the content service&apos;s asset upload (<code>POST /assets</code>) is live — until
      then, link videos by URL.
    </span>
  </span>
)

export function LessonForm({
  initial,
  submitLabel = 'Add lesson',
  onSubmit,
}: {
  initial?: Lesson
  submitLabel?: string
  onSubmit: (input: LessonInput) => Promise<unknown>
}) {
  const [videoFile, setVideoFile] = useState<File[]>([])
  const [attachments, setAttachments] = useState<File[]>([])
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toValues(initial) })
  const type = useWatch({ control, name: 'lesson_type' })

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(toInput(values))
      if (!initial) {
        reset()
        setVideoFile([])
        setAttachments([])
      }
    } catch {
      // Surfaced by the global mutation toast; keep the form so nothing typed is lost.
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

      <FileDropzone
        label="Attachments (optional)"
        extensions={DOCUMENT_EXTENSIONS}
        maxBytes={50 * MB}
        multiple
        files={attachments}
        onChange={setAttachments}
        note={UPLOAD_NOTE}
      />

      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting} disabled={!!initial && !isDirty}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
