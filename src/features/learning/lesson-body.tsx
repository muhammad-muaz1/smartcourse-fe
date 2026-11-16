import { ExternalLink } from 'lucide-react'
import type { Lesson } from '@/lib/api/types'

/** Turn a YouTube watch/short link into its embeddable form; null for anything else. */
function youtubeEmbed(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname.endsWith('youtu.be')) return `https://www.youtube-nocookie.com/embed${parsed.pathname}`
    if (parsed.hostname.includes('youtube.com')) {
      const id = parsed.searchParams.get('v')
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
    }
  } catch {
    // Malformed URL: fall through to the plain link.
  }
  return null
}

/**
 * Text bodies are Markdown on the backend. Rendered as paragraphs here — deliberately
 * without `dangerouslySetInnerHTML` — until a sanitising Markdown renderer is agreed.
 */
function TextBody({ content }: { content: string }) {
  return (
    <div className="prose-lesson">
      {content.split(/\n{2,}/).map((block, i) => (
        <p key={i} className="whitespace-pre-line">
          {block}
        </p>
      ))}
    </div>
  )
}

export function LessonBody({ lesson }: { lesson: Lesson }) {
  if ('content' in lesson.body) return <TextBody content={lesson.body.content} />

  const { video_url, transcript } = lesson.body
  const embed = youtubeEmbed(video_url)
  return (
    <div className="space-y-6">
      <div className="aspect-video overflow-hidden rounded-xl bg-zinc-900">
        {embed ? (
          <iframe
            src={embed}
            title={lesson.title}
            className="size-full"
            allow="accelerometer; encrypted-media; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        ) : /\.(mp4|webm|ogg)(\?|$)/i.test(video_url) ? (
          <video src={video_url} controls className="size-full" preload="metadata" />
        ) : (
          <a
            href={video_url}
            target="_blank"
            rel="noreferrer noopener"
            className="flex size-full items-center justify-center gap-2 text-sm text-white/80 hover:text-white"
          >
            Open video <ExternalLink className="size-4" />
          </a>
        )}
      </div>
      {transcript && (
        <details className="rounded-xl border border-zinc-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-zinc-800">Transcript</summary>
          <div className="mt-3">
            <TextBody content={transcript} />
          </div>
        </details>
      )}
    </div>
  )
}
