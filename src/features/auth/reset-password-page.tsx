import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { errorMessage } from '@/lib/api/client'
import { useDocumentTitle } from '@/lib/hooks'
import { authApi } from './api'
import { AuthLayout } from './auth-layout'

const schema = z
  .object({
    new_password: z.string().min(8, 'At least 8 characters').max(128),
    confirm: z.string(),
  })
  .refine((v) => v.new_password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
type FormValues = z.infer<typeof schema>

export default function ResetPasswordPage() {
  useDocumentTitle('Choose a new password')
  const navigate = useNavigate()
  const token = useSearchParams()[0].get('token') ?? ''
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })
  const reset = useMutation({
    mutationFn: ({ new_password }: FormValues) => authApi.resetPassword(token, new_password),
    onSuccess: () => navigate('/login', { replace: true, state: { passwordReset: true } }),
    meta: { silent: true },
  })

  return (
    <AuthLayout title="Choose a new password" subtitle="Reset links are single-use and expire after a short time.">
      {!token ? (
        <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This link is missing its reset token.{' '}
          <Link to="/forgot-password" className="font-medium underline">
            Request a new link
          </Link>
          .
        </p>
      ) : (
        <form onSubmit={handleSubmit((values) => reset.mutate(values))} className="space-y-4" noValidate>
          <Field label="New password" error={errors.new_password?.message} hint="At least 8 characters">
            {(a) => <Input type="password" autoComplete="new-password" autoFocus {...a} {...register('new_password')} />}
          </Field>
          <Field label="Confirm password" error={errors.confirm?.message}>
            {(a) => <Input type="password" autoComplete="new-password" {...a} {...register('confirm')} />}
          </Field>
          {reset.isError && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {errorMessage(reset.error)}{' '}
              <Link to="/forgot-password" className="font-medium underline">
                Request a new link
              </Link>
            </p>
          )}
          <Button type="submit" className="w-full" size="lg" loading={reset.isPending}>
            Update password
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
