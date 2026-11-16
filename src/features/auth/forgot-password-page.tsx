import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { MailCheck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { errorMessage } from '@/lib/api/client'
import { useDocumentTitle } from '@/lib/hooks'
import { authApi } from './api'
import { AuthLayout } from './auth-layout'

const schema = z.object({ email: z.email('Enter a valid email') })
type FormValues = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  useDocumentTitle('Reset password')
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })
  const request = useMutation({
    mutationFn: ({ email }: FormValues) => authApi.forgotPassword(email),
    meta: { silent: true },
  })

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle={
        <>
          Remembered it?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Back to sign in
          </Link>
        </>
      }
    >
      {request.isSuccess ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5" role="status">
          <MailCheck className="size-5 text-emerald-600" />
          <p className="mt-2 text-sm font-medium text-emerald-900">Check your inbox</p>
          <p className="mt-1 text-sm text-emerald-800">
            If an account exists for {request.variables.email}, a reset link is on its way. For privacy, we show this message
            either way.
          </p>
          <p className="mt-3 text-xs text-emerald-700">
            Local environments don&apos;t send email — the reset token is written to the identity service log. Open{' '}
            <code>/reset-password?token=…</code> with it.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit((values) => request.mutate(values))} className="space-y-4" noValidate>
          <Field label="Email" error={errors.email?.message} hint="We'll send a link to choose a new password.">
            {(a) => <Input type="email" autoComplete="email" autoFocus {...a} {...register('email')} />}
          </Field>
          {request.isError && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {errorMessage(request.error)}
            </p>
          )}
          <Button type="submit" className="w-full" size="lg" loading={request.isPending}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
