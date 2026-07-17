/**
 * M8.2 — MFA fatigue attack simulation
 * M8.3 — Replay attack simulation
 */
import { useState } from 'react';
import apiClient from '../lib/apiClient';
import { getRefreshToken, setTokens } from '../lib/auth';

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

// ── Replay attack types ────────────────────────────────────────────────────
type ReplayStep = 'idle' | 'running' | 'done' | 'no-token';
interface ReplayResult {
  label: string;
  status: number;
  body: unknown;
  success: boolean;
}

export default function AttackDemoPage() {
  // MFA fatigue state
  const [running, setRunning]   = useState(false);
  const [results, setResults]   = useState<AttemptResult[]>([]);
  const [done, setDone]         = useState(false);

  // Replay attack state
  const [replayStep, setReplayStep]     = useState<ReplayStep>('idle');
  const [replayResults, setReplayResults] = useState<ReplayResult[]>([]);

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

  // ── M8.3: Replay attack simulation ───────────────────────────────────────
  async function simulateReplayAttack() {
    const currentRt = getRefreshToken();
    if (!currentRt) {
      setReplayStep('no-token');
      return;
    }

    setReplayStep('running');
    setReplayResults([]);
    const log: ReplayResult[] = [];

    // Step 1 — First refresh: should succeed and rotate the token
    const capturedToken = currentRt; // the "stolen" token captured at this moment
    let step1Status = 0;
    let step1Body: unknown = null;
    let step1Ok = false;
    try {
      const tokens = await apiClient.post<{ accessToken: string; refreshToken: string }>(
        '/api/auth/refresh',
        { refreshToken: capturedToken }
      );
      step1Status = 200;
      step1Body = { accessToken: '…' + tokens.accessToken.slice(-8), refreshToken: '…' + tokens.refreshToken.slice(-8) };
      step1Ok = true;
      setTokens(tokens.accessToken, tokens.refreshToken); // update live session
    } catch (err: unknown) {
      const e = err as { statusCode?: number; body?: unknown };
      step1Status = e.statusCode ?? 0;
      step1Body = e.body;
    }
    log.push({ label: '1st refresh (attacker captures token)', status: step1Status, body: step1Body, success: step1Ok });
    setReplayResults([...log]);

    await new Promise((r) => setTimeout(r, 600));

    // Step 2 — Replay the OLD (now consumed) token → should be rejected
    let step2Status = 0;
    let step2Body: unknown = null;
    let step2Ok = false;
    try {
      const tokens = await apiClient.post<{ accessToken: string; refreshToken: string }>(
        '/api/auth/refresh',
        { refreshToken: capturedToken } // same old token
      );
      step2Status = 200;
      step2Body = tokens;
      step2Ok = true; // should NOT happen
    } catch (err: unknown) {
      const e = err as { statusCode?: number; body?: unknown };
      step2Status = e.statusCode ?? 0;
      step2Body = e.body;
    }
    log.push({ label: '2nd refresh (replay of captured token)', status: step2Status, body: step2Body, success: step2Ok });
    setReplayResults([...log]);

    setReplayStep('done');
  }

  function resetReplay() {
    setReplayStep('idle');
    setReplayResults([]);
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
        {/* Replay attack card — M8.3 */}
        <div className="mt-6 rounded-xl border border-border bg-surface-elevated shadow-lg overflow-hidden">
          <div className="bg-warning/8 border-b border-warning/20 px-6 py-4 flex items-start gap-4">
            <div className="mt-0.5 text-2xl select-none">🎭</div>
            <div>
              <h2 className="font-heading font-semibold text-ink-primary">Token Replay Attack</h2>
              <p className="mt-1 text-sm text-ink-secondary">
                Simulates a stolen refresh token being replayed. The first call succeeds and
                rotates the token. The second call with the same old token is rejected, and the
                entire session family is revoked.
              </p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">

            {replayStep === 'no-token' && (
              <div className="rounded-md bg-warning/10 border border-warning/30 px-4 py-3 text-sm text-warning">
                ⚠ No active session. Please{' '}
                <a href="/login" className="underline">sign in</a> first to run this demo.
              </div>
            )}

            <div className="flex gap-3">
              <button
                id="btn-replay-attack"
                type="button"
                disabled={replayStep === 'running'}
                onClick={simulateReplayAttack}
                className="
                  rounded-md bg-warning text-surface-base text-sm font-semibold
                  px-5 py-2.5 hover:bg-warning/90 transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                {replayStep === 'running' ? 'Simulating…' : '▶ Simulate Replay Attack'}
              </button>
              {replayStep === 'done' && (
                <button
                  type="button"
                  onClick={resetReplay}
                  className="rounded-md border border-border text-sm px-5 py-2.5 text-ink-secondary hover:bg-surface-subtle transition-colors"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Side-by-side results */}
            {replayResults.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {replayResults.map((r) => (
                  <div
                    key={r.label}
                    className={`rounded-lg border p-4 ${
                      r.success
                        ? 'border-success/30 bg-success/5'
                        : 'border-danger/30 bg-danger/5'
                    }`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted mb-3">
                      {r.label}
                    </p>
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-bold font-mono ${
                          r.success ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
                        }`}
                      >
                        {r.status}
                      </span>
                      <span className={`text-sm font-medium ${
                        r.success ? 'text-success' : 'text-danger'
                      }`}>
                        {r.success ? '✓ Success' : '✗ Rejected'}
                      </span>
                    </div>
                    <pre className="text-xs text-ink-muted bg-surface-subtle rounded p-2 overflow-auto max-h-24 whitespace-pre-wrap">
                      {JSON.stringify(r.body, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}

            {replayStep === 'done' && replayResults.length === 2 && (
              <div className="rounded-md bg-success/10 border border-success/30 px-4 py-3 text-sm text-success font-medium">
                ✓ Replay rejected: the consumed token was refused and the session family was revoked.
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
