import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { errorMessage } from '@/lib/api/client'
import { signIn } from './api'
import { AuthLayout } from './auth-layout'
import { homeFor } from './home'

const schema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})
type FormValues = z.infer<typeof schema>

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as { from?: string; passwordReset?: boolean } | null
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const login = useMutation({
    mutationFn: ({ email, password }: FormValues) => signIn(email, password),
    onSuccess: (user) => navigate(state?.from ?? homeFor(user.role), { replace: true }),
    // Shown inline under the form rather than as a toast.
    meta: { silent: true },
  })

  return (
    <AuthLayout
      title="Welcome back"
      subtitle={
        <>
          New here?{' '}
          <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">
            Create an account
          </Link>
        </>
      }
    >
      {state?.passwordReset && (
        <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Password updated — sign in with your new password.
        </p>
      )}
      <form onSubmit={handleSubmit((values) => login.mutate(values))} className="space-y-4" noValidate>
        <Field label="Email" error={errors.email?.message}>
          {(a) => <Input type="email" autoComplete="email" autoFocus {...a} {...register('email')} />}
        </Field>
        <Field label="Password" error={errors.password?.message}>
          {(a) => <Input type="password" autoComplete="current-password" {...a} {...register('password')} />}
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-xs font-medium text-brand-600 hover:text-brand-700">
            Forgot password?
          </Link>
        </div>
        {login.isError && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errorMessage(login.error)}
          </p>
        )}
        <Button type="submit" className="w-full" size="lg" loading={login.isPending}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  )
}
