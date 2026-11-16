import { useInfiniteQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/primitives'
import type { CourseLevel } from '@/lib/api/types'
import { useDebouncedValue, useDocumentTitle } from '@/lib/hooks'
import { catalogQuery } from './api'
import { CourseCard } from './course-card'

const LEVELS: CourseLevel[] = ['beginner', 'intermediate', 'advanced']

export default function CatalogPage() {
  useDocumentTitle('Catalogue')
  // Filters live in the URL so a search is shareable and survives reload/back.
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const level = (params.get('level') as CourseLevel | null) ?? undefined
  const debouncedQ = useDebouncedValue(q.trim(), 300)

  const filters = useMemo(
    () => ({ q: debouncedQ || undefined, level, status: 'published' as const }),
    [debouncedQ, level],
  )
  const query = useInfiniteQuery({ ...catalogQuery(filters), placeholderData: (prev) => prev })
  const courses = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data])

  function updateParam(key: string, value: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }

  return (
    <>
      <PageHeader title="Course catalogue" description="Browse published courses and start learning." />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
          <Input
            type="search"
            placeholder="Search courses…"
            value={q}
            onChange={(e) => updateParam('q', e.target.value)}
            className="pl-9"
            aria-label="Search courses"
          />
        </div>
        <Select
          value={level ?? ''}
          onChange={(e) => updateParam('level', e.target.value)}
          className="sm:w-48"
          aria-label="Filter by level"
        >
          <option value="">All levels</option>
          {LEVELS.map((l) => (
            <option key={l} value={l} className="capitalize">
              {l[0]!.toUpperCase() + l.slice(1)}
            </option>
          ))}
        </Select>
      </div>

      {query.isPending ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : courses.length === 0 ? (
        <EmptyState
          title={debouncedQ || level ? 'No courses match your filters' : 'No published courses yet'}
          description={debouncedQ || level ? 'Try a different search term or level.' : 'Check back soon.'}
        />
      ) : (
        <>
          <div
            className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            aria-busy={query.isFetching}
          >
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
          {query.hasNextPage && (
            <div className="mt-8 flex justify-center">
              <Button
                variant="secondary"
                loading={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </>
  )
}
