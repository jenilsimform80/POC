/** Only same-app absolute paths are accepted as a post-login return target (never another site). */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/login')) return '/';
  return value;
}
