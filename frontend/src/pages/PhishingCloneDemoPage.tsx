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
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
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
      const options = await apiClient.post<PublicKeyCredentialRequestOptionsJSON>(
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0f0f14] px-4 py-8 sm:py-12">

      {/* ── Demo banner (always visible, clearly non-deceptive) ── */}
      <div className="mb-5 w-full max-w-lg">
        <div id="phish-demo-notice" className="flex items-start gap-3 rounded-xl border border-danger/60 bg-danger/8 px-5 py-4">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-danger/60 text-sm font-semibold text-danger" aria-hidden="true">!</span>
          <div>
            <p className="text-sm font-bold text-danger uppercase tracking-wider">
              DEMO: Simulated Phishing Clone
            </p>
            <p className="mt-1 text-xs leading-5 text-[#b5bbc8]">
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
          <p className="mt-1 font-mono text-xs text-[#858b99]">
            secure-trustline-login.example.com  {/* fake domain shown as UX cue */}
          </p>
        </div>

        {/* Clone card — dark but subtly different palette */}
        <div className="rounded-xl border border-[#343445] bg-[#1a1a24] p-6 shadow-xl sm:p-8">
          <h1 className="mb-1 text-xl font-semibold text-white">Sign in</h1>
          <p className="mb-6 text-xs text-[#858b99]">Simulated lookalike interface</p>

          {/* ── Idle / Attempt phases ── */}
          {(phase === 'idle' || phase === 'attempting') && (
            <form onSubmit={handlePhishAttempt} aria-describedby="phish-demo-notice" className="space-y-5">
              <div>
                <label htmlFor="phish-email" className="mb-1.5 block text-sm text-[#c4c8d2]">
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
                    transition-colors disabled:cursor-not-allowed disabled:opacity-50
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
                  transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]/50 disabled:opacity-60 disabled:cursor-not-allowed
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
              <div role="alert" className="rounded-lg border border-[#f87171]/40 bg-[#2d1515] px-4 py-4">
                <p className="mb-1 text-sm font-semibold text-[#f87171]">
                  Passkey authentication was not completed
                </p>
                <p className="text-xs text-[#9ca3af] font-mono break-words">
                  {errorMsg || 'The operation either timed out or was not allowed.'}
                </p>
              </div>

              {/* Explanation panel */}
              <div className="rounded-lg border border-[#4ade80]/30 bg-[#0f1f14] px-4 py-4">
                <p className="mb-2 text-sm font-semibold text-[#4ade80]">
                  Why the simulated clone cannot authenticate:
                </p>
                <ul className="text-xs text-[#9ca3af] space-y-2 list-none">
                  <li className="flex gap-2">
                    <span className="shrink-0 text-[#4ade80]" aria-hidden="true">•</span>
                    <span>
                      <strong className="text-white">Passkeys are origin-bound.</strong>{' '}
                      A credential registered on <code className="bg-[#111118] px-1 rounded">localhost:5173</code> cannot
                      be used on a different domain — the browser cryptographically enforces this.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="shrink-0 text-[#4ade80]" aria-hidden="true">•</span>
                    <span>
                      <strong className="text-white">No phishable secret.</strong>{' '}
                      Unlike passwords, passkey authentication never transmits a secret the
                      attacker can capture and replay.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="shrink-0 text-[#4ade80]" aria-hidden="true">•</span>
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
                className="w-full rounded-md border border-[#3c3c4d] px-4 py-2 text-sm text-[#c4c8d2] transition-colors hover:bg-[#252532] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]/50"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        {/* Link back to real login */}
        <p className="mt-5 text-center text-xs text-[#858b99]">
          Go to the{' '}
          <a href="/login" className="text-[#a78bfa] hover:underline">
            real TrustLine login ↗
          </a>
        </p>
      </div>
    </div>
  );
}
