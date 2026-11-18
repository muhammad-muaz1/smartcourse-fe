import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, FileText, Pencil, PlayCircle, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/form'
import { Modal } from '@/components/ui/modal'
import { Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/primitives'
import { coursesApi, courseKeys, lessonQuery, modulesQuery } from '@/features/courses/api'
import type { CourseModule, Lesson, LessonInput, LessonSummary, ModuleInput } from '@/lib/api/types'
import { LessonForm } from './lesson-form'

function swap<T>(items: T[], i: number, j: number): T[] {
  const next = [...items]
  ;[next[i], next[j]] = [next[j]!, next[i]!]
  return next
}

function useCurriculumMutations(courseId: string) {
  const queryClient = useQueryClient()
  // The curriculum list and the course detail (catalogue page, player) both embed modules.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: courseKeys.modules(courseId) }),
      queryClient.invalidateQueries({ queryKey: courseKeys.detail(courseId) }),
    ])
  return {
    addModule: useMutation({ mutationFn: (title: string) => coursesApi.addModule(courseId, { title, description: null }), onSuccess: refresh }),
    updateModule: useMutation({
      mutationFn: ({ id, input }: { id: string; input: ModuleInput }) => coursesApi.updateModule(id, input),
      onSuccess: refresh,
      meta: { successMessage: 'Module updated' },
    }),
    deleteModule: useMutation({ mutationFn: coursesApi.deleteModule, onSuccess: refresh }),
    reorderModules: useMutation({ mutationFn: (ids: string[]) => coursesApi.reorderModules(courseId, ids), onSuccess: refresh }),
    addLesson: useMutation({
      mutationFn: ({ moduleId, input }: { moduleId: string; input: LessonInput }) => coursesApi.addLesson(moduleId, input),
      onSuccess: refresh,
      meta: { successMessage: 'Lesson added' },
    }),
    updateLesson: useMutation({
      mutationFn: ({ id, input }: { id: string; input: LessonInput }) => coursesApi.updateLesson(id, input),
      onSuccess: (lesson) => {
        queryClient.setQueryData(courseKeys.lesson(lesson.id), lesson)
        return refresh()
      },
      meta: { successMessage: 'Lesson updated' },
    }),
    deleteLesson: useMutation({ mutationFn: coursesApi.deleteLesson, onSuccess: refresh }),
    reorderLessons: useMutation({
      mutationFn: ({ moduleId, ids }: { moduleId: string; ids: string[] }) => coursesApi.reorderLessons(moduleId, ids),
      onSuccess: refresh,
    }),
  }
}
type Mutations = ReturnType<typeof useCurriculumMutations>

function ModuleForm({ module, pending, onSubmit }: { module: CourseModule; pending: boolean; onSubmit: (input: ModuleInput) => void }) {
  const [title, setTitle] = useState(module.title)
  const [description, setDescription] = useState(module.description ?? '')
  function submit(event: FormEvent) {
    event.preventDefault()
    if (title.trim()) onSubmit({ title: title.trim(), description: description.trim() || null })
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Title" error={title.trim() ? undefined : 'Title is required'}>
        {(a) => <Input autoFocus maxLength={255} value={title} onChange={(e) => setTitle(e.target.value)} {...a} />}
      </Field>
      <Field label="Description (optional)">
        {(a) => <Textarea rows={3} maxLength={10_000} value={description} onChange={(e) => setDescription(e.target.value)} {...a} />}
      </Field>
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>Save module</Button>
      </div>
    </form>
  )
}

/** Loads the full lesson (body included) before showing the edit form. */
function EditLesson({ lessonId, courseId, onSubmit, onComplete }: { lessonId: string; courseId: string; onSubmit: (input: LessonInput) => Promise<Lesson>; onComplete: () => void }) {
  const lesson = useQuery(lessonQuery(lessonId))
  if (lesson.isPending) return <div className="space-y-3"><Skeleton className="h-9" /><Skeleton className="h-40" /></div>
  if (lesson.isError) return <ErrorState error={lesson.error} onRetry={() => void lesson.refetch()} />
  return <LessonForm initial={lesson.data} submitLabel="Save lesson" courseId={courseId} onSubmit={onSubmit} onComplete={onComplete} />
}

function LessonRow({ lesson, index, total, editable, onMove, onEdit, onDelete }: {
  lesson: LessonSummary
  index: number
  total: number
  editable: boolean
  onMove: (to: number) => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <li className="flex items-center gap-3 px-5 py-3 text-sm">
      {lesson.lesson_type === 'video' ? <PlayCircle className="size-4 text-zinc-400" /> : <FileText className="size-4 text-zinc-400" />}
      <span className="flex-1">{lesson.title}</span>
      {lesson.duration_minutes != null && <span className="text-xs text-zinc-400">{lesson.duration_minutes} min</span>}
      {editable && (
        <div className="flex items-center">
          <Button variant="ghost" size="icon" disabled={index === 0} aria-label="Move lesson up" onClick={() => onMove(index - 1)}><ArrowUp className="size-3.5" /></Button>
          <Button variant="ghost" size="icon" disabled={index === total - 1} aria-label="Move lesson down" onClick={() => onMove(index + 1)}><ArrowDown className="size-3.5" /></Button>
          <Button variant="ghost" size="icon" aria-label="Edit lesson" onClick={onEdit}><Pencil className="size-3.5" /></Button>
          <Button variant="ghost" size="icon" aria-label="Delete lesson" onClick={onDelete}><Trash2 className="size-3.5 text-rose-500" /></Button>
        </div>
      )}
    </li>
  )
}

function ModuleCard({ module, index, count, editable, m, onMove, onEdit, onAddLesson, onEditLesson }: {
  module: CourseModule
  index: number
  count: number
  editable: boolean
  m: Mutations
  onMove: (from: number, to: number) => void
  onEdit: () => void
  onAddLesson: () => void
  onEditLesson: (lessonId: string) => void
}) {
  const lessons = module.lessons
  return (
    <Card>
      <div className="flex items-start gap-3 border-b border-zinc-100 px-5 py-4">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-zinc-100 text-xs font-semibold text-zinc-600">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{module.title}</p>
          {module.description && <p className="mt-0.5 text-sm text-zinc-500">{module.description}</p>}
        </div>
        {editable && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label="Move module up"><ArrowUp className="size-4" /></Button>
            <Button variant="ghost" size="icon" disabled={index === count - 1} onClick={() => onMove(index, index + 1)} aria-label="Move module down"><ArrowDown className="size-4" /></Button>
            <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit module"><Pencil className="size-4" /></Button>
            <Button variant="ghost" size="icon" aria-label="Delete module"
              onClick={() => confirm(`Delete module “${module.title}” and its lessons?`) && m.deleteModule.mutate(module.id)}>
              <Trash2 className="size-4 text-rose-500" />
            </Button>
          </div>
        )}
      </div>
      {lessons.length === 0 ? (
        <p className="px-5 py-4 text-sm text-amber-700">No lessons yet — publishing validates that every module has at least one.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {lessons.map((lesson, li) => (
            <LessonRow
              key={lesson.id}
              lesson={lesson}
              index={li}
              total={lessons.length}
              editable={editable}
              onMove={(to) => m.reorderLessons.mutate({ moduleId: module.id, ids: swap(lessons, li, to).map((l) => l.id) })}
              onEdit={() => onEditLesson(lesson.id)}
              onDelete={() => confirm(`Delete lesson “${lesson.title}”?`) && m.deleteLesson.mutate(lesson.id)}
            />
          ))}
        </ul>
      )}
      {editable && (
        <div className="border-t border-zinc-100 px-5 py-2.5">
          <Button variant="ghost" size="sm" icon={<Plus className="size-3.5" />} onClick={onAddLesson}>Add lesson</Button>
        </div>
      )}
    </Card>
  )
}

type Dialog =
  | { kind: 'add-lesson'; module: CourseModule }
  | { kind: 'edit-lesson'; lessonId: string }
  | { kind: 'edit-module'; module: CourseModule }
  | null

export function CurriculumEditor({ courseId, editable }: { courseId: string; editable: boolean }) {
  const m = useCurriculumMutations(courseId)
  const modules = useQuery(modulesQuery(courseId))
  const [newModule, setNewModule] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const close = () => setDialog(null)

  function submitModule(event: FormEvent) {
    event.preventDefault()
    const title = newModule.trim()
    if (!title) return
    m.addModule.mutate(title, { onSuccess: () => setNewModule('') })
  }

  if (modules.isPending) return <div className="space-y-5">{Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>
  if (modules.isError) return <ErrorState error={modules.error} onRetry={() => void modules.refetch()} />
  const list = modules.data

  return (
    <div className="space-y-5">
      {list.length === 0 && !editable && <Card><EmptyState title="No modules" /></Card>}
      {list.map((module, index) => (
        <ModuleCard
          key={module.id}
          module={module}
          index={index}
          count={list.length}
          editable={editable}
          m={m}
          onMove={(from, to) => m.reorderModules.mutate(swap(list, from, to).map((mod) => mod.id))}
          onEdit={() => setDialog({ kind: 'edit-module', module })}
          onAddLesson={() => setDialog({ kind: 'add-lesson', module })}
          onEditLesson={(lessonId) => setDialog({ kind: 'edit-lesson', lessonId })}
        />
      ))}

      {editable && (
        <form onSubmit={submitModule} className="flex gap-3">
          <Input value={newModule} onChange={(e) => setNewModule(e.target.value)} placeholder="New module title" aria-label="New module title" maxLength={255} />
          <Button type="submit" variant="secondary" icon={<Plus className="size-4" />} loading={m.addModule.isPending}>Add module</Button>
        </form>
      )}

      <Modal open={dialog?.kind === 'add-lesson'} onClose={close} title="Add lesson"
        description={dialog?.kind === 'add-lesson' ? `In “${dialog.module.title}”` : undefined} className="max-w-2xl">
        {dialog?.kind === 'add-lesson' && (
          <LessonForm courseId={courseId} onComplete={close} onSubmit={(input) => m.addLesson.mutateAsync({ moduleId: dialog.module.id, input })} />
        )}
      </Modal>
      <Modal open={dialog?.kind === 'edit-lesson'} onClose={close} title="Edit lesson" className="max-w-2xl">
        {dialog?.kind === 'edit-lesson' && (
          <EditLesson lessonId={dialog.lessonId} courseId={courseId} onComplete={close} onSubmit={(input) => m.updateLesson.mutateAsync({ id: dialog.lessonId, input })} />
        )}
      </Modal>
      <Modal open={dialog?.kind === 'edit-module'} onClose={close} title="Edit module">
        {dialog?.kind === 'edit-module' && (
          <ModuleForm
            module={dialog.module}
            pending={m.updateModule.isPending}
            onSubmit={(input) => m.updateModule.mutate({ id: dialog.module.id, input }, { onSuccess: close })}
          />
        )}
      </Modal>
    </div>
  )
}
