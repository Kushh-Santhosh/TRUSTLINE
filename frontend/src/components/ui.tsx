export function PasskeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
    </svg>
  );
}

export function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
  );
}

export function ErrorAlert({ message }: { message: string }) {
  return (
    <div role="alert" className="alert-error mb-5 flex items-start gap-2.5">
      <svg className="w-4 h-4 shrink-0 mt-0.5 text-danger" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0zm-7 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-1-9a1 1 0 0 0-1 1v4a1 1 0 1 0 2 0V6a1 1 0 0 0-1-1z" clipRule="evenodd"/>
      </svg>
      <span>{message}</span>
    </div>
  );
}

export function Wordmark() {
  return (
    <div className="mb-8 text-center">
      <a href="/" className="inline-flex items-center gap-2 no-underline group">
        <div className="h-8 w-8 rounded-xl bg-ink-primary flex items-center justify-center shrink-0 shadow-sm group-hover:shadow-md transition-shadow duration-200">
          <span className="text-ink-inverted text-sm font-bold tracking-tight">T</span>
        </div>
        <span className="text-lg font-semibold text-ink-primary tracking-tight">TrustLine</span>
      </a>
    </div>
  );
}
