/**
 * AttackSimulation — interactive demo component
 *
 * Renders four pre-built attack scenarios. Each scenario can be
 * "run" via a button that animates the signal chain step-by-step,
 * updates the trust score, and displays the final security decision.
 *
 * MOCK DATA ONLY — to wire to a backend, pass `scenarios` prop.
 *
 * Usage:
 *   <AttackSimulation />                         — mock data
 *   <AttackSimulation scenarios={apiScenarios} /> — live data
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SignalSeverity = 'critical' | 'high' | 'medium' | 'low';
export type DecisionOutcome =
  | 'attack_blocked'
  | 'stepup_required'
  | 'session_terminated'
  | 'allowed';

export interface AttackSignal {
  id: string;
  label: string;
  severity: SignalSeverity;
  description: string;
}

export interface AttackScenario {
  id: string;
  name: string;
  description: string;
  attackType: 'phishing' | 'new_device' | 'session_hijack' | 'replay';
  initialScore: number;
  signals: AttackSignal[];
  updatedScore: number;
  decision: DecisionOutcome;
  decisionReason: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock scenarios
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_SCENARIOS: AttackScenario[] = [
  {
    id: 'phishing',
    name: 'Phishing Attempt',
    attackType: 'phishing',
    description:
      'Attacker tricks the user into submitting credentials on a cloned TrustLine login page. The engine detects domain mismatch and token replay.',
    initialScore: 78,
    signals: [
      { id: 'ph-1', label: 'Domain Mismatch Detected',    severity: 'critical', description: 'Origin domain does not match registered WebAuthn RP ID.' },
      { id: 'ph-2', label: 'Credential Replay Attempt',   severity: 'critical', description: 'Passkey challenge was replayed from a different session.' },
      { id: 'ph-3', label: 'Geolocation Anomaly',         severity: 'high',     description: 'Login origin is 8,400 km from last known location.' },
      { id: 'ph-4', label: 'Unknown Referrer',            severity: 'medium',   description: 'HTTP Referer header points to an unregistered domain.' },
    ],
    updatedScore: 4,
    decision: 'attack_blocked',
    decisionReason:
      'WebAuthn replay protection flagged this request. Session terminated and device fingerprint blocklisted.',
  },
  {
    id: 'new_device',
    name: 'New Device Login',
    attackType: 'new_device',
    description:
      'A login is attempted from a device that has never been seen before. Risk is elevated but not conclusive — step-up auth is issued.',
    initialScore: 92,
    signals: [
      { id: 'nd-1', label: 'Unknown Device Fingerprint', severity: 'high',   description: 'No stored device record matches current hardware profile.' },
      { id: 'nd-2', label: 'New Browser Agent',          severity: 'medium', description: 'Browser UA string has not been seen on this account.' },
      { id: 'nd-3', label: 'High Value Approval Active', severity: 'high',   description: 'An open approval request exceeds ₹10L threshold.' },
    ],
    updatedScore: 41,
    decision: 'stepup_required',
    decisionReason:
      'Trust score dropped below Medium threshold. Step-up authentication (TOTP or passkey re-assertion) is required before proceeding.',
  },
  {
    id: 'session_hijack',
    name: 'Session Hijacking',
    attackType: 'session_hijack',
    description:
      'An active refresh token is stolen and used from a different IP. The engine detects token family reuse and terminates the session family.',
    initialScore: 85,
    signals: [
      { id: 'sh-1', label: 'Refresh Token Family Reuse',  severity: 'critical', description: 'Same token family ID presented from two different IPs simultaneously.' },
      { id: 'sh-2', label: 'IP Address Changed Mid-Session', severity: 'critical', description: 'Session IP changed from 192.168.x.x to 45.33.x.x within 4 seconds.' },
      { id: 'sh-3', label: 'Concurrent Session Anomaly',  severity: 'high',     description: 'Two active sessions detected under same account with different fingerprints.' },
      { id: 'sh-4', label: 'Unusual Access Pattern',      severity: 'medium',   description: 'API call rate doubled in the last 60 seconds.' },
    ],
    updatedScore: 2,
    decision: 'session_terminated',
    decisionReason:
      'Token theft detected via refresh rotation anomaly. All active sessions for this account have been revoked immediately.',
  },
  {
    id: 'replay',
    name: 'Replay Attack',
    attackType: 'replay',
    description:
      'A previously signed approval payload is re-submitted in an attempt to duplicate a transaction. The cryptographic audit chain rejects it.',
    initialScore: 71,
    signals: [
      { id: 'rp-1', label: 'Duplicate Transaction Hash',   severity: 'critical', description: 'SHA-256 hash of this payload already exists in the audit chain.' },
      { id: 'rp-2', label: 'Timestamp Out of Window',      severity: 'high',     description: 'Payload timestamp is 47 minutes old; replay window is 5 minutes.' },
      { id: 'rp-3', label: 'Nonce Already Consumed',       severity: 'critical', description: 'Request nonce was already used in a prior valid transaction.' },
    ],
    updatedScore: 0,
    decision: 'attack_blocked',
    decisionReason:
      'Ed25519-signed payload rejected — nonce already consumed and hash collision detected in tamper-evident audit log.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────

function severityTokens(s: SignalSeverity) {
  switch (s) {
    case 'critical': return { pill: 'bg-danger-muted text-danger border border-danger-border',  dot: 'bg-danger',  label: 'Critical' };
    case 'high':     return { pill: 'bg-warning-muted text-warning border border-warning-border', dot: 'bg-warning', label: 'High' };
    case 'medium':   return { pill: 'bg-accent-muted text-accent border border-accent-border',  dot: 'bg-accent',  label: 'Medium' };
    case 'low':      return { pill: 'bg-surface-subtle text-ink-secondary border border-border', dot: 'bg-ink-muted', label: 'Low' };
  }
}

function decisionTokens(d: DecisionOutcome) {
  switch (d) {
    case 'attack_blocked':
      return {
        icon: (
          <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="10" cy="10" r="7" />
            <path d="M7 7l6 6M13 7l-6 6" strokeLinecap="round" />
          </svg>
        ),
        wrap:   'bg-danger-muted border-danger-border text-danger',
        label:  'Attack Blocked',
        emoji:  '🚫',
      };
    case 'stepup_required':
      return {
        icon: (
          <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M10 3L3 16h14L10 3z" strokeLinejoin="round" />
            <path d="M10 8.5v4M10 14.5h.01" strokeLinecap="round" />
          </svg>
        ),
        wrap:   'bg-warning-muted border-warning-border text-warning',
        label:  'Step-up Auth Required',
        emoji:  '⚠️',
      };
    case 'session_terminated':
      return {
        icon: (
          <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="3" y="3" width="14" height="14" rx="3" />
            <path d="M7 7l6 6M13 7l-6 6" strokeLinecap="round" />
          </svg>
        ),
        wrap:   'bg-danger-muted border-danger-border text-danger',
        label:  'Session Terminated',
        emoji:  '❌',
      };
    case 'allowed':
      return {
        icon: (
          <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="10" cy="10" r="7" />
            <path d="M7 10l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
        wrap:   'bg-success-muted border-success-border text-success',
        label:  'Session Allowed',
        emoji:  '✅',
      };
  }
}

function attackTypeIcon(t: AttackScenario['attackType']) {
  const cls = 'w-5 h-5';
  switch (t) {
    case 'phishing':
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M2 12l5-9 2 4 2-2 3 7H2z" strokeLinejoin="round" />
          <circle cx="11" cy="5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'new_device':
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <rect x="1" y="2.5" width="14" height="9" rx="1.5" />
          <path d="M5 13.5h6M8 11.5v2" strokeLinecap="round" />
          <path d="M11 5.5v3M9.5 7h3" strokeLinecap="round" />
        </svg>
      );
    case 'session_hijack':
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <circle cx="8" cy="8" r="5.5" />
          <path d="M5 8h6M8 5v6" strokeLinecap="round" />
          <path d="M3 3l2.5 2.5M13 3l-2.5 2.5" strokeLinecap="round" />
        </svg>
      );
    case 'replay':
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M2.5 8A5.5 5.5 0 0113 5.5" strokeLinecap="round" />
          <path d="M13.5 8A5.5 5.5 0 013 10.5" strokeLinecap="round" />
          <path d="M11 3.5l2 2-2 2M5 10.5l-2 2 2 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Animated trust score counter
// ─────────────────────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 700) {
  const [value, setValue] = useState(target);
  const rafRef  = useRef<number | null>(null);
  const prevRef = useRef(target);

  useEffect(() => {
    const from = prevRef.current;
    const to   = target;
    const start = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    function step(now: number) {
      const p = Math.min((now - start) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setValue(Math.round(from + (to - from) * e));
      if (p < 1) rafRef.current = requestAnimationFrame(step);
      else prevRef.current = to;
    }
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Score pill
// ─────────────────────────────────────────────────────────────────────────────

function ScorePill({ score, label }: { score: number; label: string }) {
  const displayed = useCountUp(score);
  const colour =
    score >= 70 ? { bar: 'bg-success', text: 'text-success', ring: 'border-success-border bg-success-muted' }
    : score >= 40 ? { bar: 'bg-warning', text: 'text-warning', ring: 'border-warning-border bg-warning-muted' }
    : { bar: 'bg-danger', text: 'text-danger', ring: 'border-danger-border bg-danger-muted' };

  return (
    <div className={`inline-flex flex-col items-center gap-1.5 rounded-xl border px-5 py-3 ${colour.ring}`}>
      <span className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">{label}</span>
      <span className={`text-3xl font-bold tabular-nums leading-none ${colour.text}`}>{displayed}</span>
      <div className="w-24 h-1.5 rounded-full bg-surface-subtle overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${colour.bar}`}
          style={{ width: `${displayed}%` }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual signal row (animated entrance)
// ─────────────────────────────────────────────────────────────────────────────

function SignalRow({ signal, index }: { signal: AttackSignal; index: number }) {
  const tok = severityTokens(signal.severity);
  return (
    <div
      className="flex items-start gap-3 animate-[fadeSlideIn_0.4s_ease_both]"
      style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'both' }}
    >
      <div className="flex flex-col items-center shrink-0 pt-1" style={{ width: 20 }}>
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${tok.dot}`} aria-hidden="true" />
        <div className="w-px flex-1 mt-1.5 bg-border" style={{ minHeight: 20 }} />
      </div>
      <div className="flex-1 min-w-0 pb-4">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-sm font-medium text-ink-primary">{signal.label}</span>
          <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${tok.pill}`}>{tok.label}</span>
        </div>
        <p className="text-xs text-ink-muted leading-5">{signal.description}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Decision outcome card
// ─────────────────────────────────────────────────────────────────────────────

function DecisionCard({ scenario }: { scenario: AttackScenario }) {
  const tok = decisionTokens(scenario.decision);
  return (
    <div className={`rounded-xl border p-5 animate-[fadeSlideIn_0.4s_ease_both] ${tok.wrap}`}>
      <div className="flex items-center gap-3 mb-3">
        {tok.icon}
        <span className="text-base font-bold">{tok.label}</span>
      </div>
      <p className="text-sm leading-6 opacity-90">{scenario.decisionReason}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Connector arrow
// ─────────────────────────────────────────────────────────────────────────────

function Connector() {
  return (
    <div className="flex flex-col items-center py-1">
      <div className="w-px h-5 bg-border" />
      <svg className="w-3 h-3 text-ink-muted -mt-0.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 2v8M3 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario selector tab
// ─────────────────────────────────────────────────────────────────────────────

function ScenarioTab({
  scenario,
  active,
  onClick,
}: {
  scenario: AttackScenario;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      id={`attack-scenario-tab-${scenario.id}`}
      type="button"
      onClick={onClick}
      className={`
        flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left
        transition-all duration-150 w-full
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40
        ${active
          ? 'bg-ink-primary border-ink-primary text-ink-inverted shadow-sm'
          : 'bg-surface-elevated border-border text-ink-secondary hover:border-border-strong hover:text-ink-primary hover:bg-surface-subtle'}
      `}
    >
      <span className={`shrink-0 ${active ? 'text-ink-inverted' : 'text-ink-muted'}`}>
        {attackTypeIcon(scenario.attackType)}
      </span>
      <span className="text-sm font-medium truncate">{scenario.name}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulation panel for a single scenario
// ─────────────────────────────────────────────────────────────────────────────

type SimState = 'idle' | 'running' | 'done';

const SIGNAL_DELAY_MS = 500; // gap between each signal appearing

function SimulationPanel({ scenario }: { scenario: AttackScenario }) {
  const [state, setState]            = useState<SimState>('idle');
  const [revealedCount, setRevealed] = useState(0);
  const [showUpdated, setShowUpdated] = useState(false);
  const [showDecision, setShowDecision] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Clear all pending timers
  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  // Reset everything
  const reset = useCallback(() => {
    clearTimers();
    setState('idle');
    setRevealed(0);
    setShowUpdated(false);
    setShowDecision(false);
  }, [clearTimers]);

  // Reset when scenario changes
  useEffect(() => { reset(); }, [scenario.id, reset]);

  // Cleanup on unmount
  useEffect(() => () => clearTimers(), [clearTimers]);

  function runSimulation() {
    if (state !== 'idle') return;
    setState('running');
    setRevealed(0);
    setShowUpdated(false);
    setShowDecision(false);

    // Reveal signals one by one
    scenario.signals.forEach((_, i) => {
      const t = setTimeout(() => {
        setRevealed(i + 1);
      }, (i + 1) * SIGNAL_DELAY_MS);
      timersRef.current.push(t);
    });

    // Show updated score after all signals
    const scoreDelay = (scenario.signals.length + 1) * SIGNAL_DELAY_MS;
    timersRef.current.push(setTimeout(() => setShowUpdated(true), scoreDelay));

    // Show decision
    timersRef.current.push(setTimeout(() => {
      setShowDecision(true);
      setState('done');
    }, scoreDelay + 500));
  }

  const dtok = decisionTokens(scenario.decision);

  return (
    <div className="flex flex-col gap-0 lg:flex-row lg:gap-8">

      {/* ── Left: description + controls ── */}
      <div className="lg:w-72 shrink-0 flex flex-col gap-4 mb-6 lg:mb-0">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-ink-muted">{attackTypeIcon(scenario.attackType)}</span>
            <h4 className="text-sm font-semibold text-ink-primary">{scenario.name}</h4>
          </div>
          <p className="text-xs text-ink-muted leading-5">{scenario.description}</p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          <button
            id={`attack-run-${scenario.id}`}
            type="button"
            onClick={runSimulation}
            disabled={state !== 'idle'}
            className="
              inline-flex items-center justify-center gap-2
              rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-ink-inverted
              hover:bg-accent-hover active:bg-accent-active active:scale-[0.98]
              shadow-sm transition-all duration-150
              disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none
            "
          >
            {state === 'running' ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8 2a6 6 0 100 12A6 6 0 008 2z" strokeDasharray="25 15" />
                </svg>
                Running…
              </>
            ) : state === 'done' ? (
              <>
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M5 8l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="8" cy="8" r="5.5" />
                </svg>
                Simulation Complete
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M5 3.5l7 4.5-7 4.5V3.5z" strokeLinejoin="round" />
                </svg>
                Run Simulation
              </>
            )}
          </button>

          {state !== 'idle' && (
            <button
              id={`attack-reset-${scenario.id}`}
              type="button"
              onClick={reset}
              className="
                inline-flex items-center justify-center gap-2
                rounded-lg border border-border bg-surface-elevated
                px-4 py-2 text-sm font-medium text-ink-secondary
                hover:bg-surface-subtle hover:text-ink-primary
                transition-all duration-150 shadow-xs
              "
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 7A5 5 0 0111.5 4.5" strokeLinecap="round" />
                <path d="M12 7A5 5 0 012.5 9.5" strokeLinecap="round" />
                <path d="M10 2.5l1.5 2-2 1.5M4 9l-1.5 2 2 1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Reset Simulation
            </button>
          )}
        </div>

        {/* Outcome summary (shown after completion) */}
        {state === 'done' && (
          <div className={`rounded-lg border p-3 animate-[fadeSlideIn_0.35s_ease_both] ${dtok.wrap}`}>
            <div className="flex items-center gap-2">
              {dtok.icon}
              <span className="text-sm font-bold">{dtok.label}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Right: animated flow ── */}
      <div className="flex-1 min-w-0">
        {state === 'idle' ? (
          <div className="flex flex-col items-center justify-center h-full min-h-48 rounded-xl border border-dashed border-border bg-surface-subtle gap-3 py-10">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-elevated border border-border text-ink-muted">
              <svg className="w-5 h-5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 3.5l7 4.5-7 4.5V3.5z" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-ink-primary">Ready to simulate</p>
              <p className="text-xs text-ink-muted mt-0.5">Click &ldquo;Run Simulation&rdquo; to begin</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-0">

            {/* ① Initial trust score */}
            <div className="animate-[fadeSlideIn_0.3s_ease_both]">
              <ScorePill score={scenario.initialScore} label="Initial Trust Score" />
            </div>

            <Connector />

            {/* ② Signal chain */}
            <div className="w-full rounded-xl border border-border bg-surface-elevated shadow-xs px-4 py-4 mb-0">
              <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted mb-3">
                Triggered Signals
              </p>
              {scenario.signals.slice(0, revealedCount).map((sig, i) => (
                <SignalRow key={sig.id} signal={sig} index={i} />
              ))}
              {revealedCount < scenario.signals.length && state === 'running' && (
                <div className="flex items-center gap-2 py-1">
                  <svg className="w-3.5 h-3.5 text-ink-muted animate-pulse" viewBox="0 0 12 12" fill="currentColor">
                    <circle cx="2" cy="6" r="1.5" /><circle cx="6" cy="6" r="1.5" /><circle cx="10" cy="6" r="1.5" />
                  </svg>
                  <span className="text-2xs text-ink-muted">Evaluating signals…</span>
                </div>
              )}
              {revealedCount === 0 && state !== 'running' && (
                <p className="text-xs text-ink-muted">No signals triggered yet.</p>
              )}
            </div>

            {/* ③ Updated score */}
            {showUpdated && (
              <>
                <Connector />
                <div className="animate-[fadeSlideIn_0.35s_ease_both]">
                  <ScorePill score={scenario.updatedScore} label="Updated Trust Score" />
                </div>
              </>
            )}

            {/* ④ Final decision */}
            {showDecision && (
              <>
                <Connector />
                <div className="w-full">
                  <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted mb-2">
                    Security Decision
                  </p>
                  <DecisionCard scenario={scenario} />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

interface AttackSimulationProps {
  /**
   * Optional scenarios from an API. Omit to use built-in mock data.
   */
  scenarios?: AttackScenario[];
  /** Optional Tailwind wrapper classes */
  className?: string;
}

export default function AttackSimulation({ scenarios, className = '' }: AttackSimulationProps) {
  const source = scenarios ?? MOCK_SCENARIOS;
  const [activeIdx, setActiveIdx] = useState(0);

  return (
    <section aria-labelledby="attack-sim-heading" className={className}>

      {/* ── Section header ── */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-danger-muted border border-danger-border">
            <svg className="w-3.5 h-3.5 text-danger" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 1.5L1.5 13h13L8 1.5z" strokeLinejoin="round" />
              <path d="M8 6v3.5M8 11.5h.01" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h2 id="attack-sim-heading" className="text-sm font-semibold text-ink-primary leading-none mb-0.5">
              Attack Simulation
            </h2>
            <p className="text-xs text-ink-muted leading-none">
              Interactive demo of how TrustLine defends against real attack vectors
            </p>
          </div>
          {!scenarios && (
            <span className="rounded-full bg-danger-muted border border-danger-border px-2 py-0.5 text-2xs font-semibold text-danger">
              Demo
            </span>
          )}
        </div>
        <span className="text-xs text-ink-muted tabular-nums">{source.length} scenarios</span>
      </div>

      {/* ── Info banner ── */}
      <div className="mb-4 rounded-lg border border-border bg-surface-elevated px-4 py-3 flex items-start gap-3 shadow-xs">
        <svg className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="5.5" />
          <path d="M8 5.5v3M8 10.5h.01" strokeLinecap="round" />
        </svg>
        <p className="text-xs text-ink-secondary leading-5">
          Select an attack scenario below, then click <span className="font-medium text-ink-primary">Run Simulation</span> to watch TrustLine&apos;s
          Adaptive Trust Engine evaluate the threat and reach a security decision step-by-step.{' '}
          <span className="font-medium text-ink-primary">Mock data only</span> — no backend calls are made.
        </p>
      </div>

      {/* ── Main card ── */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-xs">

        {/* Card header: scenario tabs */}
        <div className="px-5 py-4 border-b border-border bg-surface-subtle/60 sm:px-6">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted mb-3">
            Attack Scenarios
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {source.map((s, i) => (
              <ScenarioTab
                key={s.id}
                scenario={s}
                active={activeIdx === i}
                onClick={() => setActiveIdx(i)}
              />
            ))}
          </div>
        </div>

        {/* Card body: simulation panel */}
        <div className="p-5 sm:p-6">
          <SimulationPanel key={source[activeIdx].id} scenario={source[activeIdx]} />
        </div>

        {/* Card footer */}
        <div className="px-5 py-4 border-t border-border bg-surface-subtle/40 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-2 w-2 rounded-full bg-danger" aria-hidden="true" />
            <p className="text-xs text-ink-muted">
              Simulated attacks do not affect your account or session.
              All detection logic runs in the browser against mock data.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
