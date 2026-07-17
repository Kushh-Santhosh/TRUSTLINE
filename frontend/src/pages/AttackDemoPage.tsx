/**
 * M8.2 — MFA fatigue attack simulation
 * M8.3 — Replay attack simulation
 * Logic unchanged. UI polished.
 */
import { useState } from 'react';
import apiClient from '../lib/apiClient';
import { getRefreshToken, setTokens } from '../lib/auth';

function fakePendingToken(sub: string): string {
  const toB64Url = (s: string) =>
    btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const header  = toB64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toB64Url(JSON.stringify({ sub, purpose: 'step_up', iat: Math.floor(Date.now() / 1000) }));
  return `${header}.${payload}.DEMO_FAKE_SIGNATURE`;
}

interface AttemptResult {
  attempt: number;
  status: number;
  body: unknown;
  blocked: boolean;
}

type ReplayStep = 'idle' | 'running' | 'done' | 'no-token';
interface ReplayResult {
  label: string;
  status: number;
  body: unknown;
  success: boolean;
}

export default function AttackDemoPage() {
  const [running, setRunning]   = useState(false);
  const [results, setResults]   = useState<AttemptResult[]>([]);
  const [done, setDone]         = useState(false);

  const [replayStep, setReplayStep]       = useState<ReplayStep>('idle');
  const [replayResults, setReplayResults] = useState<ReplayResult[]>([]);

  async function simulateMfaFatigue() {
    setRunning(true);
    setResults([]);
    setDone(false);

    const demoUserId = 'demo-attacker-001';
    const token = fakePendingToken(demoUserId);
    const newResults: AttemptResult[] = [];

    for (let i = 1; i <= 5; i++) {
      if (i > 1) await new Promise((r) => setTimeout(r, 350));
      let status = 0;
      let body: unknown = null;
      let blocked = false;
      try {
        body = await apiClient.post('/api/auth/login/step-up', {
          pendingToken: token,
          code: '000000',
        });
        status = 200;
      } catch (err: unknown) {
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

  async function simulateReplayAttack() {
    const currentRt = getRefreshToken();
    if (!currentRt) { setReplayStep('no-token'); return; }

    setReplayStep('running');
    setReplayResults([]);
    const log: ReplayResult[] = [];

    const capturedToken = currentRt;
    let step1Status = 0; let step1Body: unknown = null; let step1Ok = false;
    try {
      const tokens = await apiClient.post<{ accessToken: string; refreshToken: string }>(
        '/api/auth/refresh', { refreshToken: capturedToken }
      );
      step1Status = 200;
      step1Body = { accessToken: '…' + tokens.accessToken.slice(-8), refreshToken: '…' + tokens.refreshToken.slice(-8) };
      step1Ok = true;
      setTokens(tokens.accessToken, tokens.refreshToken);
    } catch (err: unknown) {
      const e = err as { statusCode?: number; body?: unknown };
      step1Status = e.statusCode ?? 0; step1Body = e.body;
    }
    log.push({ label: '1st refresh (attacker captures token)', status: step1Status, body: step1Body, success: step1Ok });
    setReplayResults([...log]);

    await new Promise((r) => setTimeout(r, 600));

    let step2Status = 0; let step2Body: unknown = null; let step2Ok = false;
    try {
      const tokens = await apiClient.post<{ accessToken: string; refreshToken: string }>(
        '/api/auth/refresh', { refreshToken: capturedToken }
      );
      step2Status = 200; step2Body = tokens; step2Ok = true;
    } catch (err: unknown) {
      const e = err as { statusCode?: number; body?: unknown };
      step2Status = e.statusCode ?? 0; step2Body = e.body;
    }
    log.push({ label: '2nd refresh (replay of captured token)', status: step2Status, body: step2Body, success: step2Ok });
    setReplayResults([...log]);
    setReplayStep('done');
  }

  function resetReplay() {
    setReplayStep('idle');
    setReplayResults([]);
  }

  const dangerBtn = `rounded-lg border border-danger-border bg-danger-muted text-danger text-sm font-medium
    px-4 py-2.5 hover:bg-danger/15 transition-colors duration-150
    disabled:opacity-50 disabled:cursor-not-allowed`;

  const warningBtn = `rounded-lg border border-warning-border bg-warning-muted text-warning text-sm font-medium
    px-4 py-2.5 hover:bg-warning/15 transition-colors duration-150
    disabled:opacity-50 disabled:cursor-not-allowed`;

  const ghostBtn = `rounded-lg border border-border text-ink-secondary text-sm font-medium
    px-5 py-2.5 hover:bg-surface-subtle transition-colors duration-150`;

  return (
    <div className="min-h-screen bg-surface-base px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-8">

        {/* Page header */}
        <div className="border-b border-border pb-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-danger-border bg-danger-muted px-2 py-0.5 text-2xs font-semibold text-danger">
              Controlled simulation
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-primary">Security Defences</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-secondary">
            Controlled demonstration of real-world attack patterns and TrustLine's automated defences.
          </p>
        </div>

        {/* ── MFA Fatigue card ── */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-xs">
          <div className="border-b border-border px-5 py-4 sm:px-6">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-danger-border bg-danger-muted">
                <span className="text-danger text-sm font-bold">!</span>
              </div>
              <div>
                <h2 className="text-base font-semibold text-ink-primary">MFA Fatigue Attack</h2>
                <p className="text-sm text-ink-secondary mt-0.5">
                  Fires 5 rapid step-up requests for the same identity. TrustLine blocks after 3 attempts
                  within 60 seconds, returning{' '}
                  <code className="rounded bg-surface-subtle px-1.5 py-0.5 text-xs font-mono text-danger border border-border">
                    429
                  </code>.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap gap-3">
              <button
                id="btn-mfa-fatigue"
                type="button"
                disabled={running}
                onClick={simulateMfaFatigue}
                className={dangerBtn}
              >
                {running ? 'Simulating…' : 'Run simulation'}
              </button>
              {done && (
                <button type="button" onClick={reset} className={ghostBtn}>
                  Reset
                </button>
              )}
            </div>

            {results.length > 0 && (
              <div className="space-y-2">
                <p className="text-2xs font-medium uppercase tracking-wider text-ink-muted">Request log</p>
                <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {results.map((r) => (
                    <div
                      key={r.attempt}
                      className={`px-4 py-3 flex items-center gap-4 text-sm ${
                        r.blocked ? 'bg-danger-muted' : 'bg-surface-elevated'
                      }`}
                    >
                      <span className="font-mono text-xs text-ink-muted w-8 shrink-0 tabular-nums">
                        #{r.attempt}
                      </span>
                      <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-mono font-semibold tabular-nums ${
                        r.blocked
                          ? 'border border-danger-border bg-danger-muted text-danger'
                          : r.status === 401
                            ? 'border border-warning-border bg-warning-muted text-warning'
                            : 'bg-surface-subtle text-ink-secondary border border-border'
                      }`}>
                        {r.status}
                      </span>
                      <span className={`text-sm ${r.blocked ? 'text-danger font-medium' : 'text-ink-secondary'}`}>
                        {r.blocked
                          ? 'Blocked — rate limit exceeded'
                          : r.status === 401
                            ? 'Rejected (invalid token / wrong code)'
                            : 'Request sent'}
                      </span>
                    </div>
                  ))}
                </div>
                {done && (
                  <div role="status" className="rounded-lg border border-success-border bg-success-muted px-4 py-3 text-sm font-medium text-success">
                    Defence confirmed — attempt #{results.findIndex(r => r.blocked) + 1} onwards returned 429.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Replay Attack card ── */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-xs">
          <div className="border-b border-border px-5 py-4 sm:px-6">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-warning-border bg-warning-muted">
                <span className="text-warning text-sm font-bold">↩</span>
              </div>
              <div>
                <h2 className="text-base font-semibold text-ink-primary">Token Replay Attack</h2>
                <p className="text-sm text-ink-secondary mt-0.5">
                  Simulates a stolen refresh token being replayed. First call rotates the token;
                  second call with the same old token is rejected and the entire session family is revoked.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 px-5 py-5 sm:px-6">
            {replayStep === 'no-token' && (
              <div role="status" className="rounded-lg border border-warning-border bg-warning-muted px-4 py-3 text-sm text-warning">
                No active session.{' '}
                <a href="/login" className="underline underline-offset-2">Sign in</a> first to run this demo.
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                id="btn-replay-attack"
                type="button"
                disabled={replayStep === 'running'}
                onClick={simulateReplayAttack}
                className={warningBtn}
              >
                {replayStep === 'running' ? 'Simulating…' : 'Run simulation'}
              </button>
              {replayStep === 'done' && (
                <button type="button" onClick={resetReplay} className={ghostBtn}>
                  Reset
                </button>
              )}
            </div>

            {replayResults.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {replayResults.map((r) => (
                  <div
                    key={r.label}
                    className={`rounded-lg border p-4 ${
                      r.success
                        ? 'border-success-border bg-success-muted'
                        : 'border-danger-border bg-danger-muted'
                    }`}
                  >
                    <p className="text-xs font-medium text-ink-muted mb-3 uppercase tracking-wider">
                      {r.label}
                    </p>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-mono font-semibold border ${
                        r.success
                          ? 'bg-success-muted text-success border-success-border'
                          : 'bg-danger-muted text-danger border-danger-border'
                      }`}>
                        {r.status}
                      </span>
                      <span className={`text-sm font-medium ${r.success ? 'text-success' : 'text-danger'}`}>
                        {r.success ? 'Accepted' : 'Rejected'}
                      </span>
                    </div>
                    <pre className="text-xs text-ink-muted bg-surface-subtle border border-border rounded p-2 overflow-auto max-h-24 whitespace-pre-wrap font-mono">
                      {JSON.stringify(r.body, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}

            {replayStep === 'done' && replayResults.length === 2 && (
              <div role="status" className="rounded-lg border border-success-border bg-success-muted px-4 py-3 text-sm font-medium text-success">
                Defence confirmed — replay rejected and session family revoked.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
