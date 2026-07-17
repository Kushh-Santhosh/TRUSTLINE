/**
 * M8.5 — Phishing Clone Demo Page
 * Route: /demo/phishing-clone
 *
 * This is a clearly labelled simulation of what a phishing clone
 * of TrustLine would look like, and why passkeys defeat it.
 *
 * Key behaviour: the login button calls the same WebAuthn startAuthentication()
 * flow as the real LoginPage. Because passkeys are ORIGIN-BOUND, the browser
 * refuses to provide an assertion for a credential registered on a different
 * origin (or because no credential matches this "fake" context). The
 * browser-level error is caught and displayed with an explanation.
 *
 * No backend writes. No valid session can be obtained through this page.
 */
import { useState, type FormEvent } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import apiClient from '../lib/apiClient';

type DemoPhase = 'idle' | 'attempting' | 'failed' | 'explaining';

export default function PhishingCloneDemoPage() {
  const [email, setEmail]   = useState('');
  const [phase, setPhase]   = useState<DemoPhase>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handlePhishAttempt(e: FormEvent) {
    e.preventDefault();
    setPhase('attempting');
    setErrorMsg('');

    try {
      // Attempts the real WebAuthn flow — but the browser/authenticator
      // will refuse because this origin has no registered credential
      // matching the stored credential (or no assertion is available).
      const options = await apiClient.post<Parameters<typeof startAuthentication>[0]>(
        '/api/auth/login/options',
        { email: email.trim().toLowerCase() }
      );

      // startAuthentication will throw at the browser level if no credential
      // exists for this origin or the user cancels.
      await startAuthentication({ optionsJSON: options });

      // If we somehow reach here (e.g. same origin in dev), show the failure
      // explanation anyway to drive home the demo narrative.
      setPhase('failed');
      setErrorMsg(
        'Same-origin fallback: WebAuthn completed, but a real phishing clone ' +
        'on a different domain would fail here. Passkeys are bound to the ' +
        'registered origin and cannot be harvested.'
      );
    } catch (err) {
      // Expected path: browser throws a NotAllowedError or similar
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setPhase('failed');
    }
  }

  function reset() {
    setEmail('');
    setPhase('idle');
    setErrorMsg('');
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0f0f14] px-4 py-12">

      {/* ── Demo banner (always visible, clearly non-deceptive) ── */}
      <div className="w-full max-w-lg mb-4">
        <div className="rounded-lg border-2 border-dashed border-danger/60 bg-danger/8 px-5 py-3 flex items-center gap-3">
          <span className="text-lg">⚠️</span>
          <div>
            <p className="text-sm font-bold text-danger uppercase tracking-wider">
              DEMO: Simulated Phishing Clone
            </p>
            <p className="text-xs text-ink-secondary mt-0.5">
              This page intentionally mimics a login screen to demonstrate passkey phishing-resistance.
              It <strong>cannot</strong> produce a valid authenticated session.
            </p>
          </div>
        </div>
      </div>

      {/* ── Phishing "clone" card — subtly off branding ── */}
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {/* Slightly wrong logo to signal it's a clone */}
          <span className="text-2xl font-heading font-semibold tracking-tight text-[#a78bfa]">
            Trust<span className="text-[#f87171]">Iine</span>   {/* lowercase i ← a classic phishing tell */}
          </span>
          <p className="mt-1 text-xs text-[#6b7280]">
            secure-trustline-login.example.com  {/* fake domain shown as UX cue */}
          </p>
        </div>

        {/* Clone card — dark but subtly different palette */}
        <div className="rounded-xl bg-[#1a1a24] border border-[#2d2d3d] shadow-xl p-8">
          <h1 className="text-xl font-semibold text-white mb-6">Sign in</h1>

          {/* ── Idle / Attempt phases ── */}
          {(phase === 'idle' || phase === 'attempting') && (
            <form onSubmit={handlePhishAttempt} className="space-y-5">
              <div>
                <label htmlFor="phish-email" className="block text-sm text-[#9ca3af] mb-1.5">
                  Email address
                </label>
                <input
                  id="phish-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={phase === 'attempting'}
                  className="
                    w-full rounded-md bg-[#111118] border border-[#2d2d3d]
                    px-3.5 py-2.5 text-sm text-white placeholder-[#4b5563]
                    outline-none focus:border-[#a78bfa] focus:ring-1 focus:ring-[#a78bfa]
                    transition-colors disabled:opacity-50
                  "
                />
              </div>

              <button
                type="submit"
                id="phish-login-btn"
                disabled={phase === 'attempting'}
                className="
                  w-full rounded-md bg-[#a78bfa] text-black font-semibold
                  text-sm px-4 py-2.5 hover:bg-[#9061f9]
                  transition-colors disabled:opacity-60 disabled:cursor-not-allowed
                "
              >
                {phase === 'attempting' ? 'Attempting…' : 'Sign in with passkey'}
              </button>
            </form>
          )}

          {/* ── Failed phase ── */}
          {phase === 'failed' && (
            <div className="space-y-4">
              {/* Browser error box */}
              <div className="rounded-md bg-[#2d1515] border border-[#f87171]/40 px-4 py-4">
                <p className="text-sm font-semibold text-[#f87171] mb-1">
                  ✗ Passkey authentication failed
                </p>
                <p className="text-xs text-[#9ca3af] font-mono break-words">
                  {errorMsg || 'The operation either timed out or was not allowed.'}
                </p>
              </div>

              {/* Explanation panel */}
              <div className="rounded-md bg-[#0f1f14] border border-[#4ade80]/30 px-4 py-4">
                <p className="text-sm font-semibold text-[#4ade80] mb-2">
                  🛡 Why this phishing page failed:
                </p>
                <ul className="text-xs text-[#9ca3af] space-y-2 list-none">
                  <li className="flex gap-2">
                    <span className="text-[#4ade80] shrink-0">•</span>
                    <span>
                      <strong className="text-white">Passkeys are origin-bound.</strong>{' '}
                      A credential registered on <code className="bg-[#111118] px-1 rounded">localhost:5173</code> cannot
                      be used on a different domain — the browser cryptographically enforces this.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-[#4ade80] shrink-0">•</span>
                    <span>
                      <strong className="text-white">No phishable secret.</strong>{' '}
                      Unlike passwords, passkey authentication never transmits a secret the
                      attacker can capture and replay.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-[#4ade80] shrink-0">•</span>
                    <span>
                      <strong className="text-white">Clone detection.</strong>{' '}
                      Even if a user lands on this page, the browser refuses to produce an assertion —
                      the attacker receives nothing useful.
                    </span>
                  </li>
                </ul>
              </div>

              <button
                type="button"
                id="phish-reset-btn"
                onClick={reset}
                className="w-full rounded-md border border-[#2d2d3d] text-sm px-4 py-2 text-[#9ca3af] hover:bg-[#1a1a24] transition-colors"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        {/* Link back to real login */}
        <p className="mt-5 text-center text-xs text-[#4b5563]">
          Go to the{' '}
          <a href="/login" className="text-[#a78bfa] hover:underline">
            real TrustLine login ↗
          </a>
        </p>
      </div>
    </div>
  );
}
