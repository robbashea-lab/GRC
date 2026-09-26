import { Button } from '@/components/ui/button';

// A failed or refused register read (for example a 413 above the record limit) is never shown as
// an empty register: the page keeps a visible, persistent explanation and a way to retry.
export default function RegisterLoadError({ error, onRetry, name = 'records' }) {
  if (!error) return null;
  return <div role="alert" data-testid="register-load-error" className="mb-3 rounded-md border border-semantic-critical/40 bg-semantic-critical-bg px-3 py-2 text-sm text-ink-primary flex flex-wrap items-center gap-3">
    <span><strong>{name.charAt(0).toUpperCase() + name.slice(1)} could not be shown.</strong> {error}</span>
    {onRetry && <Button type="button" size="sm" variant="outline" onClick={onRetry}>Retry<span className="sr-only"> {name}</span></Button>}
  </div>;
}
