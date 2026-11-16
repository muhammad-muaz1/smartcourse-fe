import { Compass } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/ui/primitives'

export default function NotFoundPage() {
  return (
    <EmptyState
      icon={<Compass className="size-5" />}
      title="Page not found"
      description="The page you're looking for doesn't exist or has moved."
      action={
        <Link to="/" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          Go home
        </Link>
      }
    />
  )
}
