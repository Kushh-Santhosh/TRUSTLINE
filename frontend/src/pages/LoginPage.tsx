/**
 * M2.4 / M7.3 / M8.1 — Login page
 *
 * Phase state machine:
 *   'email'        → email + passkey sign-in form
 *   'number-match' → PushSimulator (M8.1): user must pick the correct 2-digit code
 *   'totp'         → TOTP code input; on success calls /login/step-up
 *   'done'         → navigate to dashboard
 */
import { useState, useMemo, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { startAuthentication } from '@simplewebauthn/browser';
import apiClient, { ApiError } from '../lib/apiClient';
import { setTokens } from '../lib/auth';
import PushSimulator from '../components/PushSimulator';

type Phase = 'email' | 'number-match' | 'totp' | 'done';
type Status = { type: 'idle' | 'loading' | 'success' | 'error'; message?: string };

export default function LoginPage() {
  const [email, setEmail]               = useState('');
  const [phase, setPhase]               = useState<Phase>('email');
  const [pendingToken, setPendingToken] = useState('');
  const [totpCode, setTotpCode]         = useState('');
  const [numberMatched, setNumberMatched] = useState(false);
  const [status, setStatus]             = useState<Status>({ type: 'idle' });
  const navigate = useNavigate();

  // M8.1: stable 2-digit target code for this login attempt (re-generated per mount)
  const targetCode = useMemo(() => 10 + Math.floor(Math.random() * 90), []);

  // ── Phase 1: WebAuthn ────────────────────────────────────────────────────
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus({ type: 'loading' });

    try {
      const options = await apiClient.post<Parameters<typeof startAuthentication>[0]>(
        '/api/auth/login/options',
        { email: email.trim().toLowerCase() }
      );

      const authenticationResponse = await startAuthentication({ optionsJSON: options });

      const result = await apiClient.post<
        | { accessToken: string; refreshToken: string }
        | { stepUpRequired: true; method: string; pendingToken: string }
      >('/api/auth/login/verify', {
        email: email.trim().toLowerCase(),
        response: authenticationResponse,
      });

      if ('stepUpRequired' in result && result.stepUpRequired) {
        // M7.3 / M8.1: step-up required — show number-matching challenge
        setPendingToken(result.pendingToken);
        setPhase('number-match');
        setStatus({ type: 'idle' });
      } else {
        // Low risk — tokens issued directly
        const tokens = result as { accessToken: string; refreshToken: string };
        setTokens(tokens.accessToken, tokens.refreshToken);
        setStatus({ type: 'success', message: 'Signed in!' });
        navigate('/dashboard');
      }
    } catch (err) {
      setStatus({ type: 'error', message: errorMessage(err) });
    }
  }

  // ── Phase 2 (M8.1): Number-match result ──────────────────────────────────
  function handleNumberMatch(correct: boolean) {
    if (correct) {
      setNumberMatched(true);
      setPhase('totp');
      setStatus({ type: 'idle' });
    } else {
      setStatus({ type: 'error', message: 'Incorrect number — please sign in again.' });
      // Reset to email phase after a short delay so the user sees the red state first
      setTimeout(() => {
        setPhase('email');
        setNumberMatched(false);
        setStatus({ type: 'idle' });
      }, 1800);
    }
  }

  // ── Phase 3: TOTP step-up ────────────────────────────────────────────────
  async function handleStepUp(e: FormEvent) {
    e.preventDefault();
    setStatus({ type: 'loading' });

    try {
      const tokens = await apiClient.post<{ accessToken: string; refreshToken: string }>(
        '/api/auth/login/step-up',
        { pendingToken, code: totpCode }
      );
      setTokens(tokens.accessToken, tokens.refreshToken);
      setStatus({ type: 'success', message: 'Signed in!' });
      navigate('/dashboard');
    } catch (err) {
      setStatus({ type: 'error', message: errorMessage(err) });
    }
  }

  function errorMessage(err: unknown): string {
    if (err instanceof ApiError) {
      return err.body && typeof err.body === 'object' && 'error' in err.body
        ? String((err.body as Record<string, unknown>).error)
        : err.message;
    }
    return err instanceof Error ? err.message : 'Sign-in failed. Please try again.';
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-base px-4">
      <div className={`w-full ${phase === 'number-match' ? 'max-w-2xl' : 'max-w-sm'}`}>

        {/* Logo */}
        <div className="mb-8 text-center">
          <span className="text-2xl font-heading font-semibold tracking-tight text-ink-primary">
            Trust<span className="text-accent">Line</span>
          </span>
          <p className="mt-1 text-sm text-ink-secondary">High-assurance authentication</p>
        </div>

        {/* Card */}
        <div className="rounded-xl bg-surface-elevated border border-border shadow-lg p-8">

          {/* ── Email phase ── */}
          {phase === 'email' && (
            <>
              <h1 className="text-xl font-heading font-semibold text-ink-primary mb-6">Sign in</h1>

              {status.type === 'error' && (
                <div className="mb-5 rounded-md bg-danger/10 border border-danger/30 px-4 py-3 text-sm text-danger">
                  {status.message}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="login-email" className="block text-sm font-medium text-ink-secondary mb-1.5">
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
            </>
          )}

          {/* ── Number-match phase (M8.1) ── */}
          {phase === 'number-match' && (
            <>
              <h1 className="text-xl font-heading font-semibold text-ink-primary mb-2">
                Verify your identity
              </h1>
              <p className="text-sm text-ink-secondary mb-6">
                Additional verification required. Select the number shown on your authenticator.
              </p>

              {status.type === 'error' && (
                <div className="mb-5 rounded-md bg-danger/10 border border-danger/30 px-4 py-3 text-sm text-danger">
                  {status.message}
                </div>
              )}

              <PushSimulator
                targetCode={targetCode}
                onMatch={handleNumberMatch}
                disabled={status.type === 'loading'}
              />
            </>
          )}

          {/* ── TOTP phase ── */}
          {phase === 'totp' && (
            <>
              <h1 className="text-xl font-heading font-semibold text-ink-primary mb-2">
                Enter authenticator code
              </h1>
              <p className="text-sm text-ink-secondary mb-6">
                Number matched ✓ — enter your 6-digit TOTP code to complete sign-in.
              </p>

              {status.type === 'error' && (
                <div className="mb-5 rounded-md bg-danger/10 border border-danger/30 px-4 py-3 text-sm text-danger">
                  {status.message}
                </div>
              )}

              <form onSubmit={handleStepUp} className="space-y-5">
                <div>
                  <label htmlFor="totp-code" className="block text-sm font-medium text-ink-secondary mb-1.5">
                    One-time code
                  </label>
                  <input
                    id="totp-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    autoComplete="one-time-code"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    disabled={status.type === 'loading'}
                    className="
                      w-full rounded-md bg-surface-subtle border border-border
                      px-3.5 py-2.5 text-sm text-ink-primary placeholder-ink-muted
                      outline-none focus:border-accent focus:ring-1 focus:ring-accent
                      transition-colors disabled:opacity-50 font-mono tracking-widest text-center
                    "
                  />
                </div>
                <button
                  type="submit"
                  id="step-up-submit"
                  disabled={status.type === 'loading' || totpCode.length !== 6}
                  className="
                    w-full rounded-md bg-accent text-surface-base font-semibold
                    text-sm px-4 py-2.5 hover:bg-accent-hover
                    transition-colors shadow-accent disabled:opacity-60 disabled:cursor-not-allowed
                  "
                >
                  {status.type === 'loading' ? 'Verifying…' : 'Complete sign-in'}
                </button>
              </form>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
