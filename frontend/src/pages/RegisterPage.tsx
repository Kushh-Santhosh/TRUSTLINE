import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { startRegistration, type PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
import QRCode from 'qrcode';
import apiClient, { ApiError } from '../lib/apiClient';

type Phase = 'form' | 'totp-qr' | 'done';
type Status = { type: 'idle' | 'loading' | 'success' | 'error'; message?: string };

export default function RegisterPage() {
  const [email, setEmail]             = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phase, setPhase]             = useState<Phase>('form');
  const [status, setStatus]           = useState<Status>({ type: 'idle' });

  // TOTP enrollment state
  const [userId, setUserId]           = useState('');
  const [totpCode, setTotpCode]       = useState('');
  const [qrDataUrl, setQrDataUrl]     = useState('');
  const [totpStatus, setTotpStatus]   = useState<Status>({ type: 'idle' });

  const navigate = useNavigate();

  // ── Phase 1: Passkey registration ─────────────────────────────────────────
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus({ type: 'loading' });

    try {
      // 1. Get registration options from server
      const options = await apiClient.post<PublicKeyCredentialCreationOptionsJSON>(
        '/api/auth/register/options',
        { email: email.trim().toLowerCase() }
      );

      // 2. Perform WebAuthn ceremony in the browser
      const registrationResponse = await startRegistration({ optionsJSON: options });

      // 3. Send attestation to server — returns { verified, userId }
      const { userId: newUserId } = await apiClient.post<{ verified: true; userId: string }>(
        '/api/auth/register/verify',
        {
          email: email.trim().toLowerCase(),
          response: registrationResponse,
        }
      );

      // 4. Call TOTP setup to get the otpauthUrl
      const { otpauthUrl } = await apiClient.post<{ secret: string; otpauthUrl: string }>(
        '/api/auth/totp/setup',
        { userId: newUserId }
      );

      // 5. Pre-render QR code as a PNG data URL (client-side, no network call)
      const dataUrl = await QRCode.toDataURL(otpauthUrl, {
        width: 220,
        margin: 1,
        color: { dark: '#0f172a', light: '#f8fafc' },
      });

      setUserId(newUserId);
      setQrDataUrl(dataUrl);
      setStatus({ type: 'idle' });
      setPhase('totp-qr');
    } catch (err) {
      setStatus({ type: 'error', message: apiErrorMessage(err) });
    }
  }

  // ── Phase 2: TOTP code verification ──────────────────────────────────────
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-base px-4 py-12">
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

          {/* ── Phase: form ── */}
          {phase === 'form' && (
            <>
              <h1 className="text-xl font-heading font-semibold text-ink-primary mb-6">
                Create account
              </h1>

              {status.type === 'error' && (
                <div className="mb-5 rounded-md bg-danger/10 border border-danger/30 px-4 py-3 text-sm text-danger">
                  {status.message}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Display name */}
                <div>
                  <label
                    htmlFor="register-name"
                    className="block text-sm font-medium text-ink-secondary mb-1.5"
                  >
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
                    className="
                      w-full rounded-md bg-surface-subtle border border-border
                      px-3.5 py-2.5 text-sm text-ink-primary placeholder-ink-muted
                      outline-none focus:border-accent focus:ring-1 focus:ring-accent
                      transition-colors disabled:opacity-50
                    "
                  />
                </div>

                {/* Email */}
                <div>
                  <label
                    htmlFor="register-email"
                    className="block text-sm font-medium text-ink-secondary mb-1.5"
                  >
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
                  {status.type === 'loading' ? 'Registering…' : 'Register passkey'}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-ink-muted">
                Already have an account?{' '}
                <a href="/login" className="text-accent hover:text-accent-hover font-medium">
                  Sign in
                </a>
              </p>
            </>
          )}

          {/* ── Phase: totp-qr ── */}
          {phase === 'totp-qr' && (
            <>
              <h1 className="text-xl font-heading font-semibold text-ink-primary mb-2">
                Set up authenticator
              </h1>
              <p className="text-sm text-ink-secondary mb-6">
                Scan this QR code with an authenticator app (e.g. Google Authenticator,
                Authy, 1Password), then enter the 6-digit code to confirm.
              </p>

              {/* QR code image */}
              <div className="flex justify-center mb-6">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="TOTP QR code — scan with your authenticator app"
                    width={220}
                    height={220}
                    className="rounded-lg border border-border"
                  />
                ) : (
                  <div className="w-[220px] h-[220px] rounded-lg border border-border bg-surface-subtle flex items-center justify-center">
                    <span className="text-xs text-ink-muted">Loading QR…</span>
                  </div>
                )}
              </div>

              {totpStatus.type === 'error' && (
                <div className="mb-5 rounded-md bg-danger/10 border border-danger/30 px-4 py-3 text-sm text-danger">
                  {totpStatus.message}
                </div>
              )}

              <form onSubmit={handleTotpVerify} className="space-y-5">
                <div>
                  <label
                    htmlFor="totp-enroll-code"
                    className="block text-sm font-medium text-ink-secondary mb-1.5"
                  >
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
                    placeholder="123456"
                    disabled={totpStatus.type === 'loading'}
                    className="
                      w-full rounded-md bg-surface-subtle border border-border
                      px-3.5 py-2.5 text-sm text-ink-primary placeholder-ink-muted
                      outline-none focus:border-accent focus:ring-1 focus:ring-accent
                      transition-colors disabled:opacity-50 font-mono tracking-widest text-center
                    "
                  />
                </div>
                <button
                  id="totp-enroll-submit"
                  type="submit"
                  disabled={totpStatus.type === 'loading' || totpCode.length !== 6}
                  className="
                    w-full rounded-md bg-accent text-surface-base font-semibold
                    text-sm px-4 py-2.5 hover:bg-accent-hover
                    transition-colors shadow-accent disabled:opacity-60 disabled:cursor-not-allowed
                  "
                >
                  {totpStatus.type === 'loading' ? 'Verifying…' : 'Confirm & finish'}
                </button>
              </form>
            </>
          )}

          {/* ── Phase: done ── */}
          {phase === 'done' && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <span className="text-4xl">✅</span>
              <h1 className="text-xl font-heading font-semibold text-ink-primary">
                Account ready!
              </h1>
              <p className="text-sm text-ink-secondary">
                Your passkey and authenticator are linked. Redirecting to sign-in…
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
