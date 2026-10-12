import { ApiError } from '../../api/errors';

/** Message safe to show to a user: backend messages are already user-facing; others are generic. */
export function describeError(error: Error | undefined): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}
