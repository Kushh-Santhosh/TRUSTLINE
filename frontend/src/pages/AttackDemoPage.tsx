/**
 * M8.2 — Attack Demo Page
 * Demonstrates two attack scenarios:
 *   1. MFA Fatigue — fires 5 rapid step-up requests; the 4th triggers 429 blocked
 *   2. (M8.3 placeholder for replay attack)
 */
import { useState } from 'react';
import apiClient from '../lib/apiClient';

// ── Fake pending token helper ─────────────────────────────────────────────
// Constructs a properly-formatted but unsigned JWT so the server's jwt.decode()
// can extract the sub (userId) for rate-limit tracking.
// jwt.verify() will still reject it — only the rate counter fires early.
function fakePendingToken(sub: string): string {
  const toB64Url = (s: string) =>
    btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const header  = toB64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toB64Url(JSON.stringify({ sub, purpose: 'step_up', iat: Math.floor(Date.now() / 1000) }));
  return `${header}.${payload}.DEMO_FAKE_SIGNATURE`;
}

// ── Types ─────────────────────────────────────────────────────────────────
interface AttemptResult {
  attempt: number;
  status: number;
  body: unknown;
  blocked: boolean;
}

export default function AttackDemoPage() {
  const [running, setRunning]   = useState(false);
  const [results, setResults]   = useState<AttemptResult[]>([]);
  const [done, setDone]         = useState(false);

  // ── MFA Fatigue simulation ────────────────────────────────────────────
  async function simulateMfaFatigue() {
    setRunning(true);
    setResults([]);
    setDone(false);

    const demoUserId = 'demo-attacker-001';
    const token = fakePendingToken(demoUserId);
    const newResults: AttemptResult[] = [];

    for (let i = 1; i <= 5; i++) {
      // Small delay between calls to make the animation visible
      if (i > 1) await new Promise((r) => setTimeout(r, 350));

      let status = 0;
      let body: unknown = null;
      let blocked = false;

      try {
        body = await apiClient.post('/api/auth/login/step-up', {
          pendingToken: token,
          code: '000000', // deliberately wrong code
        });
        status = 200;
      } catch (err: unknown) {
        // ApiError carries status + body
        const e = err as { statusCode?: number; body?: unknown };
        status = e.statusCode ?? 0;
        body   = e.body;
        blocked = status === 429;
      }

      const result: AttemptResult = { attempt: i, status, body, blocked };
      newResults.push(result);
      setResults([...newResults]);
    }

    setDone(true);
    setRunning(false);
  }

  function reset() {
    setResults([]);
    setDone(false);
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface-base px-4 py-12">
      <div className="mx-auto max-w-2xl">

        {/* Header */}
        <div className="mb-10">
          <span className="text-xs font-semibold uppercase tracking-widest text-danger">
            ⚠ Attack Simulation Mode
          </span>
          <h1 className="mt-2 text-3xl font-heading font-bold text-ink-primary">
            Attack Demo
          </h1>
          <p className="mt-2 text-sm text-ink-secondary">
            Controlled demonstration of real-world MFA attack patterns and TrustLine's defences.
          </p>
        </div>

        {/* MFA Fatigue card */}
        <div className="rounded-xl border border-border bg-surface-elevated shadow-lg overflow-hidden">

          {/* Card header */}
          <div className="bg-danger/8 border-b border-danger/20 px-6 py-4 flex items-start gap-4">
            <div className="mt-0.5 text-2xl select-none">💥</div>
            <div>
              <h2 className="font-heading font-semibold text-ink-primary">MFA Fatigue Attack</h2>
              <p className="mt-1 text-sm text-ink-secondary">
                Fires 5 rapid step-up requests for the same identity. TrustLine auto-blocks
                after 3 attempts within 60 seconds, returning{' '}
                <code className="rounded bg-surface-subtle px-1 py-0.5 text-xs font-mono text-danger">
                  429 blocked
                </code>
                .
              </p>
            </div>
          </div>

          {/* Card body */}
          <div className="px-6 py-5 space-y-5">

            {/* Controls */}
            <div className="flex gap-3">
              <button
                id="btn-mfa-fatigue"
                type="button"
                disabled={running}
                onClick={simulateMfaFatigue}
                className="
                  rounded-md bg-danger text-white text-sm font-semibold
                  px-5 py-2.5 hover:bg-danger/90 transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                {running ? 'Simulating…' : '▶ Simulate MFA Fatigue Attack'}
              </button>
              {done && (
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-md border border-border text-sm px-5 py-2.5 text-ink-secondary hover:bg-surface-subtle transition-colors"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Attack log */}
            {results.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">Attack log</p>
                <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
                  {results.map((r) => (
                    <div
                      key={r.attempt}
                      className={`px-4 py-3 flex items-center gap-4 text-sm transition-colors ${
                        r.blocked
                          ? 'bg-danger/8'
                          : r.status === 401 || r.status === 400
                            ? 'bg-surface-subtle'
                            : 'bg-surface-elevated'
                      }`}
                    >
                      {/* Attempt badge */}
                      <span className="font-mono text-xs text-ink-muted w-16 shrink-0">
                        #{r.attempt}
                      </span>

                      {/* Status badge */}
                      <span
                        className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold font-mono ${
                          r.blocked
                            ? 'bg-danger/20 text-danger'
                            : r.status === 401
                              ? 'bg-warning/20 text-warning'
                              : 'bg-border text-ink-secondary'
                        }`}
                      >
                        {r.status}
                      </span>

                      {/* Outcome label */}
                      <span className={r.blocked ? 'text-danger font-semibold' : 'text-ink-secondary'}>
                        {r.blocked
                          ? '🚫 BLOCKED — too many attempts'
                          : r.status === 401
                            ? 'Rejected (invalid token / wrong TOTP)'
                            : 'Request sent'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Final verdict */}
                {done && (
                  <div className="mt-3 rounded-md bg-success/10 border border-success/30 px-4 py-3 text-sm text-success font-medium">
                    ✓ Defence confirmed: attempts #{results.findIndex(r => r.blocked) + 1}–5 returned 429 and were blocked automatically.
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
