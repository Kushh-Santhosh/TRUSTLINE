import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { startAuthentication } from '@simplewebauthn/browser';
import apiClient, { ApiError } from '../lib/apiClient';
import { setTokens } from '../lib/auth';

type Status = { type: 'idle' | 'loading' | 'success' | 'error'; message?: string };

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ type: 'idle' });
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus({ type: 'loading' });

    try {
      // 1. Get authentication options from server
      const options = await apiClient.post<Parameters<typeof startAuthentication>[0]>(
        '/api/auth/login/options',
        { email: email.trim().toLowerCase() }
      );

      // 2. Perform WebAuthn authentication ceremony in the browser
      const authenticationResponse = await startAuthentication({ optionsJSON: options });

      // 3. Send assertion to server for verification + session issuance
      const tokens = await apiClient.post<{ accessToken: string; refreshToken: string }>(
        '/api/auth/login/verify',
        {
          email: email.trim().toLowerCase(),
          response: authenticationResponse,
        }
      );

      // 4. Store tokens in-memory
      setTokens(tokens.accessToken, tokens.refreshToken);

      setStatus({ type: 'success', message: 'Signed in!' });

      // 5. Redirect to dashboard
      navigate('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setStatus({
          type: 'error',
          message:
            err.body && typeof err.body === 'object' && 'error' in err.body
              ? String((err.body as Record<string, unknown>).error)
              : err.message,
        });
      } else if (err instanceof Error) {
        // WebAuthn ceremony errors (e.g. user cancelled)
        setStatus({ type: 'error', message: err.message });
      } else {
        setStatus({ type: 'error', message: 'Sign-in failed. Please try again.' });
      }
    }
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

          {/* Status messages */}
          {status.type === 'error' && (
            <div className="mb-5 rounded-md bg-danger/10 border border-danger/30 px-4 py-3 text-sm text-danger">
              {status.message}
            </div>
          )}

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
                disabled={status.type === 'loading'}
                className="
                  w-full rounded-md bg-surface-subtle border border-border
                  px-3.5 py-2.5 text-sm text-ink-primary placeholder-ink-muted
                  outline-none focus:border-accent focus:ring-1 focus:ring-accent
                  transition-colors disabled:opacity-50
                "
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={status.type === 'loading'}
              className="
                w-full rounded-md bg-accent text-surface-base font-semibold
                text-sm px-4 py-2.5 hover:bg-accent-hover
                transition-colors shadow-accent disabled:opacity-60 disabled:cursor-not-allowed
              "
            >
              {status.type === 'loading' ? 'Signing in…' : 'Sign in with passkey'}
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
