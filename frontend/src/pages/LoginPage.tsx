import { useState, type FormEvent } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    console.log('[LoginPage] submit →', { email });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-base px-4">
      <div className="w-full max-w-sm">

        {/* Logo / wordmark */}
        <div className="mb-8 text-center">
          <span className="text-2xl font-heading font-semibold tracking-tight text-ink-primary">
            Trust<span className="text-accent">Line</span>
          </span>
          <p className="mt-1 text-sm text-ink-secondary">
            High-assurance authentication
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl bg-surface-elevated border border-border shadow-lg p-8">
          <h1 className="text-xl font-heading font-semibold text-ink-primary mb-6">
            Sign in
          </h1>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label
                htmlFor="login-email"
                className="block text-sm font-medium text-ink-secondary mb-1.5"
              >
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="
                  w-full rounded-md bg-surface-subtle border border-border
                  px-3.5 py-2.5 text-sm text-ink-primary placeholder-ink-muted
                  outline-none focus:border-accent focus:ring-1 focus:ring-accent
                  transition-colors
                "
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="
                w-full rounded-md bg-accent text-surface-base font-semibold
                text-sm px-4 py-2.5 hover:bg-accent-hover
                transition-colors shadow-accent
              "
            >
              Sign in with passkey
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-muted">
            No account?{' '}
            <a href="/register" className="text-accent hover:text-accent-hover font-medium">
              Register
            </a>
          </p>
        </div>

      </div>
    </div>
  );
}
