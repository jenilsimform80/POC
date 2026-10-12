import { Link } from 'react-router';
import { EmptyState } from '../components/ui/EmptyState';

export function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you are looking for does not exist."
      action={<Link to="/">Back to home</Link>}
    />
  );
}
