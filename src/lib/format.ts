// Human-readable timestamp formatting for admin views — raw ISO strings
// were showing up unformatted (e.g. "2026-09-05T10:56:35.592627+00:00").
export function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
