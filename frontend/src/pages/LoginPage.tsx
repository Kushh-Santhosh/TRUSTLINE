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
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import apiClient, { ApiError } from '../lib/apiClient';
import { setTokens } from '../lib/auth';
import PushSimulator from '../components/PushSimulator';

type Phase = 'email' | 'number-match' | 'totp' | 'done';
type Status = { type: 'idle' | 'loading' | 'success' | 'error'; message?: string };

// ── Passkey SVG icon ──────────────────────────────────────────────────────────
function PasskeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
    </svg>
  );
}

// ── Spinner SVG ───────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────
function StepDots({ phase }: { phase: Phase }) {
  const steps: Phase[] = ['email', 'number-match', 'totp'];
  const activeIdx = steps.indexOf(phase);
  return (
    <div className="flex items-center justify-center gap-2 mb-6" aria-hidden="true">
      {steps.map((_, i) => (
        <span
          key={i}
          className={`block rounded-full transition-all duration-300 ${
            i === activeIdx
              ? 'w-6 h-1.5 bg-accent'
              : i < activeIdx
              ? 'w-1.5 h-1.5 bg-accent/40'
              : 'w-1.5 h-1.5 bg-border-strong'
          }`}
        />
      ))}
    </div>
  );
}

// ── Phase badge ───────────────────────────────────────────────────────────────
function PhaseBadge({ phase }: { phase: Phase }) {
  if (phase === 'number-match') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-warning bg-warning-muted border border-warning-border rounded-full px-3 py-1 mb-5">
        <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
        Step 2 of 3 — Number match
      </span>
    );
  }
  if (phase === 'totp') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success bg-success-muted border border-success-border rounded-full px-3 py-1 mb-5">
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        Step 3 of 3 — Authenticator code
      </span>
    );
  }
  return null;
}

// ── Error alert ───────────────────────────────────────────────────────────────
function ErrorAlert({ message }: { message: string }) {
  return (
    <div role="alert" className="alert-error mb-5 flex items-start gap-2.5">
      <svg className="w-4 h-4 shrink-0 mt-0.5 text-danger" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0zm-7 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-1-9a1 1 0 0 0-1 1v4a1 1 0 1 0 2 0V6a1 1 0 0 0-1-1z" clipRule="evenodd"/>
      </svg>
      <span>{message}</span>
    </div>
  );
}

// ── Wordmark ──────────────────────────────────────────────────────────────────
function Wordmark() {
  return (
    <div className="mb-8 text-center">
      <a href="/" className="inline-flex items-center gap-2 no-underline group">
        <div className="h-8 w-8 rounded-xl bg-ink-primary flex items-center justify-center shrink-0 shadow-sm group-hover:shadow-md transition-shadow duration-200">
          <span className="text-ink-inverted text-sm font-bold tracking-tight">T</span>
        </div>
        <span className="text-lg font-semibold text-ink-primary tracking-tight">
          TrustLine
        </span>
      </a>
    </div>
  );
}

export default function LoginPage() {
  const [email, setEmail]               = useState('');
  const [phase, setPhase]               = useState<Phase>('email');
  const [pendingToken, setPendingToken] = useState('');
  const [totpCode, setTotpCode]         = useState('');
  const [status, setStatus]             = useState<Status>({ type: 'idle' });
  const navigate = useNavigate();

  // M8.1: stable 2-digit target code for this login attempt (re-generated per mount)
  const targetCode = useMemo(() => 10 + Math.floor(Math.random() * 90), []);

  // ── Phase 1: WebAuthn ────────────────────────────────────────────────────
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus({ type: 'loading' });

    try {
      const options = await apiClient.post<PublicKeyCredentialRequestOptionsJSON>(
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
        setPendingToken(result.pendingToken);
        setPhase('number-match');
        setStatus({ type: 'idle' });
      } else {
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
      setPhase('totp');
      setStatus({ type: 'idle' });
    } else {
      setStatus({ type: 'error', message: 'Incorrect number — please sign in again.' });
      setTimeout(() => {
        setPhase('email');
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

  const isNumberMatch = phase === 'number-match';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-base px-4 py-12 sm:py-16">
      <div className={`w-full transition-all duration-300 ${isNumberMatch ? 'max-w-2xl' : 'max-w-sm'}`}>

        <Wordmark />

        {/* Step dots — visible only during multi-step flow */}
        {phase !== 'email' && <StepDots phase={phase} />}

        {/* Card */}
        <div className="card p-6 sm:p-8">

          {/* ── Email phase ── */}
          {phase === 'email' && (
            <>
              {/* Passkey icon + heading */}
              <div className="mb-7">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-accent-muted border border-accent-border mb-5">
                  <PasskeyIcon className="w-5 h-5 text-accent" />
                </div>
                <h1 className="text-xl font-semibold text-ink-primary mb-1.5">Sign in</h1>
                <p className="text-sm text-ink-secondary leading-relaxed">
                  Enter your email address, then verify with your passkey.
                </p>
              </div>

              {status.type === 'error' && <ErrorAlert message={status.message!} />}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="field">
                  <label htmlFor="login-email" className="label">Email address</label>
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={status.type === 'loading'}
                    className="input"
                  />
                </div>

                {/* Primary CTA — passkey */}
                <button
                  type="submit"
                  disabled={status.type === 'loading' || !email.trim()}
                  className="btn-primary w-full"
                >
                  {status.type === 'loading' ? (
                    <>
                      <Spinner />
                      Signing in…
                    </>
                  ) : (
                    <>
                      <PasskeyIcon className="w-4 h-4" />
                      Continue with passkey
                    </>
                  )}
                </button>
              </form>

              {/* Security note */}
              <p className="mt-4 text-xs text-ink-muted text-center leading-relaxed">
                No password required — your device authenticates you securely.
              </p>

              <div className="mt-6 pt-5 border-t border-border text-center">
                <p className="text-sm text-ink-muted">
                  No account?{' '}
                  <a href="/register" className="link">
                    Create one
                  </a>
                </p>
              </div>
            </>
          )}

          {/* ── Number-match phase (M8.1) ── */}
          {phase === 'number-match' && (
            <>
              <PhaseBadge phase={phase} />
              <div className="mb-2 flex items-center gap-3">
                <div className="h-7 w-7 rounded-full bg-warning-muted border border-warning-border flex items-center justify-center shrink-0">
                  <span className="text-warning text-xs font-bold">!</span>
                </div>
                <h1 className="text-xl font-semibold text-ink-primary">
                  Verify your identity
                </h1>
              </div>
              <p className="text-sm text-ink-secondary mb-6 pl-10">
                Select the number shown on your authenticator app.
              </p>

              {status.type === 'error' && <ErrorAlert message={status.message!} />}

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
              <PhaseBadge phase={phase} />
              <div className="mb-2 flex items-center gap-3">
                <div className="h-7 w-7 rounded-full bg-success-muted border border-success-border flex items-center justify-center shrink-0">
                  <svg className="w-3.5 h-3.5 text-success" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0z" clipRule="evenodd"/>
                  </svg>
                </div>
                <h1 className="text-xl font-semibold text-ink-primary">
                  Authenticator code
                </h1>
              </div>
              <p className="text-sm text-ink-secondary mb-6 pl-10">
                Number matched. Enter the 6-digit code from your authenticator app.
              </p>

              {status.type === 'error' && <ErrorAlert message={status.message!} />}

              <form onSubmit={handleStepUp} className="space-y-5">
                <div className="field">
                  <label htmlFor="totp-code" className="label">One-time code</label>
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
                    placeholder="000 000"
                    disabled={status.type === 'loading'}
                    className="input font-mono tracking-[0.3em] text-center text-base"
                  />
                </div>
                <button
                  type="submit"
                  id="step-up-submit"
                  disabled={status.type === 'loading' || totpCode.length !== 6}
                  className="btn-primary w-full"
                >
                  {status.type === 'loading' ? (
                    <>
                      <Spinner />
                      Verifying…
                    </>
                  ) : 'Complete sign-in'}
                </button>
              </form>
            </>
          )}

        </div>

        {/* Footer */}
        <p className="mt-5 text-center text-xs text-ink-muted">
          <svg className="inline w-3 h-3 mr-1 -mt-px opacity-60" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0 1 10 0v2a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2zm8-2v2H7V7a3 3 0 0 1 6 0z" clipRule="evenodd"/>
          </svg>
          Secured by passkeys · No passwords stored
        </p>
      </div>
    </div>
  );
}
