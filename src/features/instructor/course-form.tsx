import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { isApiError } from '@/lib/api/client'
import type { CourseInput } from '@/lib/api/types'

// Mirrors course service CourseCreate constraints.
const schema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(255),
  description: z.string().trim().min(1, 'Description is required').max(10_000),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  max_enrollments: z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) > 0 && Number(v) <= 1_000_000), 'Whole number between 1 and 1,000,000'),
})
type FormValues = z.infer<typeof schema>

export function CourseForm({
  initial,
  submitLabel,
  disabled,
  onSubmit,
}: {
  initial?: Partial<CourseInput>
  submitLabel: string
  disabled?: boolean
  onSubmit: (input: CourseInput) => Promise<unknown>
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: initial?.title ?? '',
      description: initial?.description ?? '',
      level: initial?.level ?? 'beginner',
      max_enrollments: initial?.max_enrollments ? String(initial.max_enrollments) : '',
    },
  })

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit({
        ...values,
        max_enrollments: values.max_enrollments ? Number(values.max_enrollments) : null,
      })
    } catch (error) {
      if (isApiError(error, 'VALIDATION_ERROR')) {
        for (const [field, message] of Object.entries(error.fieldErrors())) {
          if (field in schema.shape) setError(field as keyof FormValues, { message })
        }
      }
      // Other errors are surfaced by the global mutation toast.
    }
  })

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <fieldset disabled={disabled} className="space-y-4">
        <Field label="Title" error={errors.title?.message}>
          {(a) => <Input placeholder="e.g. Distributed Systems Fundamentals" {...a} {...register('title')} />}
        </Field>
        <Field label="Description" error={errors.description?.message}>
          {(a) => <Textarea rows={4} {...a} {...register('description')} />}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Level" error={errors.level?.message}>
            {(a) => (
              <Select {...a} {...register('level')}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </Select>
            )}
          </Field>
          <Field label="Seat limit" error={errors.max_enrollments?.message} hint="Blank = unlimited">
            {(a) => <Input inputMode="numeric" placeholder="Unlimited" {...a} {...register('max_enrollments')} />}
          </Field>
        </div>
      </fieldset>
      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting} disabled={disabled || (!!initial && !isDirty)}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
