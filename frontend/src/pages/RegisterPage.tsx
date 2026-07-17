import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { startRegistration, type PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
import QRCode from 'qrcode';
import apiClient, { ApiError } from '../lib/apiClient';

type Phase = 'form' | 'totp-qr' | 'done';
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

// ── Step badge ────────────────────────────────────────────────────────────────
function StepBadge({ step, label }: { step: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent bg-accent-muted border border-accent-border rounded-full px-3 py-1 mb-5">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      {step} — {label}
    </span>
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

export default function RegisterPage() {
  const [email, setEmail]             = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phase, setPhase]             = useState<Phase>('form');
  const [status, setStatus]           = useState<Status>({ type: 'idle' });

  const [userId, setUserId]           = useState('');
  const [totpCode, setTotpCode]       = useState('');
  const [qrDataUrl, setQrDataUrl]     = useState('');
  const [totpStatus, setTotpStatus]   = useState<Status>({ type: 'idle' });

  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus({ type: 'loading' });
    try {
      const options = await apiClient.post<PublicKeyCredentialCreationOptionsJSON>(
        '/api/auth/register/options',
        { email: email.trim().toLowerCase() }
      );
      const registrationResponse = await startRegistration({ optionsJSON: options });
      const { userId: newUserId } = await apiClient.post<{ verified: true; userId: string }>(
        '/api/auth/register/verify',
        { email: email.trim().toLowerCase(), response: registrationResponse }
      );
      const { otpauthUrl } = await apiClient.post<{ secret: string; otpauthUrl: string }>(
        '/api/auth/totp/setup',
        { userId: newUserId }
      );
      const dataUrl = await QRCode.toDataURL(otpauthUrl, {
        width: 200,
        margin: 1,
        color: { dark: '#111827', light: '#ffffff' },
      });
      setUserId(newUserId);
      setQrDataUrl(dataUrl);
      setStatus({ type: 'idle' });
      setPhase('totp-qr');
    } catch (err) {
      setStatus({ type: 'error', message: apiErrorMessage(err) });
    }
  }

  async function handleTotpVerify(e: FormEvent) {
    e.preventDefault();
    setTotpStatus({ type: 'loading' });
    try {
      await apiClient.post<{ enabled: true }>(
        '/api/auth/totp/verify',
        { userId, code: totpCode.trim() }
      );
      setTotpStatus({ type: 'success', message: 'Authenticator linked!' });
      setPhase('done');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setTotpStatus({ type: 'error', message: apiErrorMessage(err) });
    }
  }

  function apiErrorMessage(err: unknown): string {
    if (err instanceof ApiError) {
      return err.body && typeof err.body === 'object' && 'error' in err.body
        ? String((err.body as Record<string, unknown>).error)
        : err.message;
    }
    return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-base px-4 py-12 sm:py-16">
      <div className="w-full max-w-sm">

        <Wordmark />

        {/* Card */}
        <div className="card p-6 sm:p-8">

          {/* ── Phase: form ── */}
          {phase === 'form' && (
            <>
              {/* Passkey icon + heading */}
              <div className="mb-7">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-accent-muted border border-accent-border mb-5">
                  <PasskeyIcon className="w-5 h-5 text-accent" />
                </div>
                <h1 className="text-xl font-semibold text-ink-primary mb-1.5">Create account</h1>
                <p className="text-sm text-ink-secondary leading-relaxed">
                  Register a passkey and set up two-factor authentication.
                </p>
              </div>

              {status.type === 'error' && <ErrorAlert message={status.message!} />}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="field">
                  <label htmlFor="register-name" className="label">
                    Display name
                  </label>
                  <input
                    id="register-name"
                    type="text"
                    autoComplete="name"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Jane Smith"
                    disabled={status.type === 'loading'}
                    className="input"
                  />
                </div>

                <div className="field">
                  <label htmlFor="register-email" className="label">
                    Email address
                  </label>
                  <input
                    id="register-email"
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

                {/* Primary CTA — passkey registration */}
                <button
                  type="submit"
                  disabled={status.type === 'loading' || !email.trim() || !displayName.trim()}
                  className="btn-primary w-full"
                >
                  {status.type === 'loading' ? (
                    <>
                      <Spinner />
                      Registering…
                    </>
                  ) : (
                    <>
                      <PasskeyIcon className="w-4 h-4" />
                      Register passkey
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
                  Already have an account?{' '}
                  <a href="/login" className="link">
                    Sign in
                  </a>
                </p>
              </div>
            </>
          )}

          {/* ── Phase: totp-qr ── */}
          {phase === 'totp-qr' && (
            <>
              <StepBadge step="Step 2 of 2" label="Set up authenticator" />

              <div className="mb-2 flex items-center gap-3">
                <div className="h-7 w-7 rounded-full bg-success-muted border border-success-border flex items-center justify-center shrink-0">
                  <svg className="w-3.5 h-3.5 text-success" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0z" clipRule="evenodd"/>
                  </svg>
                </div>
                <h1 className="text-xl font-semibold text-ink-primary">Set up authenticator</h1>
              </div>
              <p className="text-sm text-ink-secondary mb-6 pl-10 leading-relaxed">
                Scan this QR code with Google Authenticator, Authy, or 1Password, then enter the 6-digit code.
              </p>

              {/* QR code */}
              <div className="flex justify-center mb-6">
                {qrDataUrl ? (
                  <div className="p-3 bg-white rounded-xl border border-border shadow-sm inline-block">
                    <img
                      src={qrDataUrl}
                      alt="TOTP QR code — scan with your authenticator app"
                      width={200}
                      height={200}
                      className="block rounded"
                    />
                  </div>
                ) : (
                  <div className="w-[200px] h-[200px] rounded-xl border border-border bg-surface-subtle flex items-center justify-center">
                    <span className="text-xs text-ink-muted">Generating QR…</span>
                  </div>
                )}
              </div>

              {totpStatus.type === 'error' && <ErrorAlert message={totpStatus.message!} />}

              <form onSubmit={handleTotpVerify} className="space-y-5">
                <div className="field">
                  <label htmlFor="totp-enroll-code" className="label">
                    6-digit code from your app
                  </label>
                  <input
                    id="totp-enroll-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    autoComplete="one-time-code"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    disabled={totpStatus.type === 'loading'}
                    className="input font-mono tracking-[0.3em] text-center text-base"
                  />
                </div>
                <button
                  id="totp-enroll-submit"
                  type="submit"
                  disabled={totpStatus.type === 'loading' || totpCode.length !== 6}
                  className="btn-primary w-full"
                >
                  {totpStatus.type === 'loading' ? (
                    <>
                      <Spinner />
                      Verifying…
                    </>
                  ) : 'Confirm & finish'}
                </button>
              </form>
            </>
          )}

          {/* ── Phase: done ── */}
          {phase === 'done' && (
            <div className="flex flex-col items-center gap-5 py-8 text-center">
              <div className="h-14 w-14 rounded-full bg-success-muted border border-success-border flex items-center justify-center">
                <svg className="w-6 h-6 text-success" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0z" clipRule="evenodd"/>
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-semibold text-ink-primary mb-2">Account ready</h1>
                <p className="text-sm text-ink-secondary leading-relaxed">
                  Your passkey and authenticator are linked.
                  <br />
                  Redirecting to sign in…
                </p>
              </div>
            </div>
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
