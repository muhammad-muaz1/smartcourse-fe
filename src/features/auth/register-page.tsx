import { zodResolver } from '@hookform/resolvers/zod'
import { GraduationCap, Presentation } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { errorMessage, isApiError } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { authApi, signIn } from './api'
import { AuthLayout } from './auth-layout'
import { homeFor } from './home'

// Mirrors identity's RegisterRequest so most errors never round-trip.
const schema = z.object({
  full_name: z.string().trim().min(1, 'Name is required').max(255),
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters').max(128),
  role: z.enum(['student', 'instructor']),
})
type FormValues = z.infer<typeof schema>

const ROLES = [
  { value: 'student', label: 'Learn', description: 'Enroll and track progress', icon: GraduationCap },
  { value: 'instructor', label: 'Teach', description: 'Create and publish courses', icon: Presentation },
] as const

export default function RegisterPage() {
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { role: 'student' } })
  const role = useWatch({ control, name: 'role' })

  const signUp = useMutation({
    mutationFn: async (values: FormValues) => {
      await authApi.register(values)
      return signIn(values.email, values.password)
    },
    onSuccess: (user) => navigate(homeFor(user.role), { replace: true }),
    onError: (error) => {
      if (isApiError(error, 'VALIDATION_ERROR')) {
        for (const [field, message] of Object.entries(error.fieldErrors())) {
          if (field in schema.shape) setError(field as keyof FormValues, { message })
        }
        return
      }
      setError('root', { message: errorMessage(error) })
    },
    meta: { silent: true },
  })
  const onSubmit = handleSubmit((values) => signUp.mutate(values))

  return (
    <AuthLayout
      title="Create your account"
      subtitle={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-zinc-700">I want to</legend>
          <div className="grid grid-cols-2 gap-3">
            {ROLES.map(({ value, label, description, icon: Icon }) => (
              <label
                key={value}
                className={cn(
                  'flex cursor-pointer flex-col gap-1 rounded-xl p-3 ring-1 transition',
                  role === value ? 'bg-brand-50 ring-2 ring-brand-500' : 'ring-zinc-200 hover:ring-zinc-300',
                )}
              >
                <input type="radio" value={value} className="sr-only" {...register('role')} />
                <Icon className={cn('size-5', role === value ? 'text-brand-600' : 'text-zinc-400')} />
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-zinc-500">{description}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Full name" error={errors.full_name?.message}>
          {(a) => <Input autoComplete="name" {...a} {...register('full_name')} />}
        </Field>
        <Field label="Email" error={errors.email?.message}>
          {(a) => <Input type="email" autoComplete="email" {...a} {...register('email')} />}
        </Field>
        <Field label="Password" error={errors.password?.message} hint="At least 8 characters">
          {(a) => <Input type="password" autoComplete="new-password" {...a} {...register('password')} />}
        </Field>
        {errors.root && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errors.root.message}
          </p>
        )}
        <Button type="submit" className="w-full" size="lg" loading={signUp.isPending}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
