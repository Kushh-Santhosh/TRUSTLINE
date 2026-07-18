/**
 * Adaptive Trust Engine — dashboard section
 *
 * Self-contained, mock-data-only component. Three cards:
 *   1. Trust Score gauge (0–100) with animated ring and level badge
 *   2. Explainability — factor list with ✓ / ⚠ indicators
 *   3. Decision — outcome pill + contextual description
 *
 * Connect to backend by replacing MOCK_TRUST_DATA with a real API call.
 */

import { useState, useEffect, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────

type TrustLevel = 'High' | 'Medium' | 'Low';
type FactorStatus = 'ok' | 'warn';
type DecisionValue = 'Continue' | 'Additional Verification Required' | 'Approval Blocked';

interface TrustFactor {
  id: string;
  label: string;
  status: FactorStatus;
}

interface TrustData {
  score: number;
  level: TrustLevel;
  factors: TrustFactor[];
  decision: DecisionValue;
  evaluatedAt: string;
}

// ── Mock scenarios ────────────────────────────────────────────────────────

const SCENARIOS: { label: string; data: TrustData }[] = [
  {
    label: 'High Trust',
    data: {
      score: 87,
      level: 'High',
      factors: [
        { id: 'known-device',    label: 'Known Device',       status: 'ok' },
        { id: 'normal-location', label: 'Normal Location',    status: 'ok' },
        { id: 'normal-time',     label: 'Normal Access Time', status: 'ok' },
        { id: 'strong-auth',     label: 'Passkey Auth Used',  status: 'ok' },
        { id: 'low-risk-action', label: 'Low-Risk Action',    status: 'ok' },
      ],
      decision: 'Continue',
      evaluatedAt: new Date().toISOString(),
    },
  },
  {
    label: 'Medium Trust',
    data: {
      score: 54,
      level: 'Medium',
      factors: [
        { id: 'known-device',    label: 'Known Device',        status: 'ok' },
        { id: 'normal-location', label: 'Normal Location',     status: 'ok' },
        { id: 'new-browser',     label: 'New Browser',         status: 'warn' },
        { id: 'high-value',      label: 'High Value Approval', status: 'warn' },
        { id: 'new-device',      label: 'New Device',          status: 'warn' },
      ],
      decision: 'Additional Verification Required',
      evaluatedAt: new Date().toISOString(),
    },
  },
  {
    label: 'Low Trust',
    data: {
      score: 21,
      level: 'Low',
      factors: [
        { id: 'unknown-device',  label: 'Unknown Device',       status: 'warn' },
        { id: 'new-location',    label: 'Unusual Location',     status: 'warn' },
        { id: 'vpn-detected',    label: 'VPN / Proxy Detected', status: 'warn' },
        { id: 'rapid-requests',  label: 'Rapid Request Burst',  status: 'warn' },
        { id: 'high-value',      label: 'High Value Approval',  status: 'warn' },
      ],
      decision: 'Approval Blocked',
      evaluatedAt: new Date().toISOString(),
    },
  },
];

// ── Design tokens ─────────────────────────────────────────────────────────

function levelConfig(level: TrustLevel) {
  switch (level) {
    case 'High':
      return {
        ring:    '#16A34A',
        ringBg:  'rgba(22,163,74,.12)',
        badge:   'bg-success-muted text-success border-success-border',
        dot:     'bg-success',
      };
    case 'Medium':
      return {
        ring:    '#D97706',
        ringBg:  'rgba(217,119,6,.12)',
        badge:   'bg-warning-muted text-warning border-warning-border',
        dot:     'bg-warning',
      };
    case 'Low':
      return {
        ring:    '#DC2626',
        ringBg:  'rgba(220,38,38,.12)',
        badge:   'bg-danger-muted text-danger border-danger-border',
        dot:     'bg-danger',
      };
  }
}

function decisionConfig(decision: DecisionValue) {
  switch (decision) {
    case 'Continue':
      return {
        icon: (
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="5.5" />
            <path d="M5.5 8l1.7 1.7L10.8 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
        badge: 'bg-success-muted text-success border border-success-border',
        desc:  'Trust level is sufficient. The session may proceed without interruption.',
        glow:  'shadow-[0_0_0_1px_rgba(22,163,74,.15),0_4px_16px_rgba(22,163,74,.08)]',
      };
    case 'Additional Verification Required':
      return {
        icon: (
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8 2.5L1.5 13h13L8 2.5z" strokeLinejoin="round" />
            <path d="M8 6.5v3M8 11h.01" strokeLinecap="round" />
          </svg>
        ),
        badge: 'bg-warning-muted text-warning border border-warning-border',
        desc:  'One or more risk signals require the user to complete step-up authentication before proceeding.',
        glow:  'shadow-[0_0_0_1px_rgba(217,119,6,.15),0_4px_16px_rgba(217,119,6,.08)]',
      };
    case 'Approval Blocked':
      return {
        icon: (
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="5.5" />
            <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" strokeLinecap="round" />
          </svg>
        ),
        badge: 'bg-danger-muted text-danger border border-danger-border',
        desc:  'Risk threshold exceeded. This request has been blocked and flagged for review.',
        glow:  'shadow-[0_0_0_1px_rgba(220,38,38,.15),0_4px_16px_rgba(220,38,38,.08)]',
      };
  }
}

// ── Animated score ring ───────────────────────────────────────────────────

function ScoreRing({ score, level }: { score: number; level: TrustLevel }) {
  const cfg = levelConfig(level);
  const radius = 52;
  const strokeW = 7;
  const normalizedR = radius - strokeW / 2;
  const circumference = 2 * Math.PI * normalizedR;

  const [displayed, setDisplayed] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const prevRef = useRef(0);
  const DURATION = 900;

  useEffect(() => {
    const from = prevRef.current;
    const to   = score;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    startRef.current = null;

    function step(now: number) {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / DURATION, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (to - from) * eased);
      setDisplayed(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        prevRef.current = to;
      }
    }

    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score]);

  const dashOffset = circumference * (1 - displayed / 100);

  return (
    <div className="relative flex items-center justify-center" style={{ width: radius * 2, height: radius * 2 }}>
      <svg
        width={radius * 2}
        height={radius * 2}
        viewBox={`0 0 ${radius * 2} ${radius * 2}`}
        style={{ transform: 'rotate(-90deg)' }}
        aria-hidden="true"
      >
        <circle cx={radius} cy={radius} r={normalizedR} fill="none" stroke={cfg.ringBg} strokeWidth={strokeW} />
        <circle
          cx={radius} cy={radius} r={normalizedR}
          fill="none"
          stroke={cfg.ring}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="text-3xl font-bold tabular-nums leading-none" style={{ color: cfg.ring }}>
          {displayed}
        </span>
        <span className="text-2xs font-semibold uppercase tracking-widest text-ink-muted">/ 100</span>
      </div>
    </div>
  );
}

// ── Scenario picker ───────────────────────────────────────────────────────

function ScenarioPicker({ active, onChange }: { active: number; onChange: (i: number) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface-subtle p-0.5 gap-0.5">
      {SCENARIOS.map((s, i) => (
        <button
          key={s.label}
          id={`trust-scenario-${i}`}
          type="button"
          onClick={() => onChange(i)}
          className={`
            px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150
            ${active === i
              ? 'bg-surface-elevated text-ink-primary shadow-xs border border-border'
              : 'text-ink-muted hover:text-ink-primary'}
          `}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

// ── Trust Score Card ──────────────────────────────────────────────────────

function TrustScoreCard({ data }: { data: TrustData }) {
  const cfg = levelConfig(data.level);
  const ts  = new Date(data.evaluatedAt);
  const timeStr = ts.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-xs h-full flex flex-col">
      <div className="px-5 py-4 border-b border-border bg-surface-subtle/60 sm:px-6 shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-ink-muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="5.5" />
            <path d="M8 5v3.5l2 1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h3 className="text-sm font-semibold text-ink-primary">Trust Score</h3>
          <span className="ml-auto text-2xs text-ink-muted font-mono">{timeStr}</span>
        </div>
      </div>

      <div className="p-5 sm:p-6 flex flex-col items-center gap-6 flex-1">
        <ScoreRing score={data.score} level={data.level} />

        <div className="text-center">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${cfg.badge}`}>
            <span className={`h-2 w-2 rounded-full animate-pulse ${cfg.dot}`} aria-hidden="true" />
            {data.level} Trust
          </span>
        </div>

        <div className="w-full space-y-1.5">
          <div className="flex justify-between text-2xs text-ink-muted font-medium">
            <span>0</span>
            <span className="font-semibold text-ink-secondary">Score: {data.score}</span>
            <span>100</span>
          </div>
          <div className="h-1.5 w-full rounded-full overflow-hidden bg-surface-subtle">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${data.score}%`, backgroundColor: cfg.ring }}
            />
          </div>
          <div className="flex justify-between">
            {[0, 25, 50, 75, 100].map((v) => (
              <span key={v} className="text-2xs text-ink-muted/60 tabular-nums">{v}</span>
            ))}
          </div>
        </div>

        <div className="w-full rounded-lg border border-border bg-surface-subtle px-4 py-3 flex items-center gap-3">
          <div className={`h-2 w-2 rounded-full shrink-0 animate-pulse ${cfg.dot}`} aria-hidden="true" />
          <span className="text-xs text-ink-secondary">
            Engine evaluated <span className="font-medium text-ink-primary">{data.factors.length} signals</span> in real-time
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Explainability Card ───────────────────────────────────────────────────

function ExplainabilityCard({ data }: { data: TrustData }) {
  const okFactors   = data.factors.filter((f) => f.status === 'ok');
  const warnFactors = data.factors.filter((f) => f.status === 'warn');

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-xs h-full flex flex-col">
      <div className="px-5 py-4 border-b border-border bg-surface-subtle/60 sm:px-6 shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-ink-muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8 2a6 6 0 100 12A6 6 0 008 2z" />
            <path d="M8 7v1.5M8 11h.01" strokeLinecap="round" />
          </svg>
          <h3 className="text-sm font-semibold text-ink-primary">Explainability</h3>
          <span className="ml-auto rounded-full bg-surface-base border border-border px-2 py-0.5 text-2xs font-semibold text-ink-muted tabular-nums">
            {data.factors.length} signals
          </span>
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-3 flex-1 flex flex-col">
        <p className="text-xs text-ink-muted leading-5">
          Contextual signals evaluated to compute the trust score for this session.
        </p>

        <div className="rounded-lg border border-border overflow-hidden flex-1 flex flex-col">
          {/* ── Trusted signals group ── */}
          {okFactors.length > 0 && (
            <>
              <div className="px-4 py-2 bg-success-muted/40 border-b border-success-border/40 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                <span className="text-2xs font-semibold uppercase tracking-wider text-success">Trusted Signals</span>
              </div>
              {okFactors.map((f) => (
                <div key={f.id} className="flex items-center gap-3 px-4 py-3 bg-surface-elevated hover:bg-surface-subtle/50 transition-colors duration-100 border-b border-border last:border-b-0">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-muted" aria-label="Passed">
                    <svg className="w-3 h-3 text-success" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 6l2.5 2.5L10 4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="text-sm font-medium text-ink-primary">{f.label}</span>
                  <span className="ml-auto text-2xs font-semibold text-success bg-success-muted px-2 py-0.5 rounded-full">Clear</span>
                </div>
              ))}
            </>
          )}

          {/* ── Risk signals group ── */}
          {warnFactors.length > 0 && (
            <>
              <div className="px-4 py-2 bg-warning-muted/50 border-y border-warning-border/40 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />
                <span className="text-2xs font-semibold uppercase tracking-wider text-warning">Risk Signals</span>
              </div>
              {warnFactors.map((f) => (
                <div key={f.id} className="flex items-center gap-3 px-4 py-3 bg-warning-muted/20 hover:bg-warning-muted/40 transition-colors duration-100 border-b border-border last:border-b-0">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warning-muted border border-warning-border" aria-label="Risk signal">
                    <svg className="w-3 h-3 text-warning" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 2.5L1.5 10h9L6 2.5z" strokeLinejoin="round" />
                      <path d="M6 5.5v2M6 9h.01" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span className="text-sm font-medium text-ink-primary">{f.label}</span>
                  <span className="ml-auto text-2xs font-semibold text-warning bg-warning-muted px-2 py-0.5 rounded-full border border-warning-border">Risk</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="flex items-center gap-4 rounded-lg bg-surface-subtle px-4 py-3 border border-border mt-auto">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-success" />
            <span className="text-xs font-medium text-ink-secondary">{okFactors.length} passed</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-warning" />
            <span className="text-xs font-medium text-ink-secondary">{warnFactors.length} flagged</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Decision Card ─────────────────────────────────────────────────────────

function DecisionCard({ data }: { data: TrustData }) {
  const dc = decisionConfig(data.decision);

  const stepMap: Record<DecisionValue, { label: string; done: boolean }[]> = {
    'Continue': [
      { label: 'Context evaluated',         done: true  },
      { label: 'Risk threshold met',        done: true  },
      { label: 'Session cleared',           done: true  },
    ],
    'Additional Verification Required': [
      { label: 'Context evaluated',         done: true  },
      { label: 'Risk signals detected',     done: true  },
      { label: 'Step-up challenge issued',  done: false },
      { label: 'Awaiting user response',    done: false },
    ],
    'Approval Blocked': [
      { label: 'Context evaluated',         done: true  },
      { label: 'Risk threshold exceeded',   done: true  },
      { label: 'Request blocked',           done: true  },
      { label: 'Security team notified',    done: false },
    ],
  };

  const steps = stepMap[data.decision];

  return (
    <div className={`overflow-hidden rounded-xl border border-border bg-surface-elevated h-full flex flex-col ${dc.glow}`}>
      <div className="px-5 py-4 border-b border-border bg-surface-subtle/60 sm:px-6 shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-ink-muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8 1.5l1.8 3.7 4 .6-2.9 2.8.7 4L8 10.4 4.4 12.6l.7-4L2.2 5.8l4-.6L8 1.5z" strokeLinejoin="round" />
          </svg>
          <h3 className="text-sm font-semibold text-ink-primary">Decision</h3>
          <span className="ml-auto text-2xs text-ink-muted uppercase tracking-wider font-semibold">Engine output</span>
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-5 flex-1 flex flex-col">
        <div className="flex flex-col items-center gap-3 py-4">
          <div className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${dc.badge}`}>
            {dc.icon}
            {data.decision}
          </div>
          <p className="text-center text-xs leading-5 text-ink-muted max-w-xs">{dc.desc}</p>
        </div>

        <div className="border-t border-border" />

        <div className="space-y-0 flex-1">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted mb-3">Decision trace</p>
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full mt-0.5
                    ${step.done
                      ? 'bg-accent text-ink-inverted'
                      : 'border-2 border-border bg-surface-subtle text-ink-muted'}
                  `}
                >
                  {step.done ? (
                    <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 5l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg className="w-2 h-2" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="4" cy="4" r="2" />
                    </svg>
                  )}
                </div>
                {i < steps.length - 1 && (
                  <div className={`w-px flex-1 my-1 ${step.done ? 'bg-accent/30' : 'bg-border'}`} style={{ minHeight: '14px' }} />
                )}
              </div>
              <p className={`text-xs pb-3 ${step.done ? 'text-ink-primary font-medium' : 'text-ink-muted'}`}>
                {step.label}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-surface-subtle border border-border px-4 py-3 mt-auto">
          <p className="text-2xs text-ink-muted leading-4">
            <span className="font-semibold text-ink-secondary">Note:</span>{' '}
            This decision is generated by the Adaptive Trust Engine and may be overridden by a senior approver using break-glass access.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────

/**
 * AdaptiveTrustEngine
 *
 * Drop this component anywhere in the dashboard to render the full
 * Trust Engine section. Uses mock data only — no backend calls.
 *
 * @param className  Optional Tailwind classes for the outer wrapper
 */
export default function AdaptiveTrustEngine({ className = '' }: { className?: string }) {
  const [scenarioIdx, setScenarioIdx] = useState(1); // start on Medium for demo value
  const [refreshing, setRefreshing]   = useState(false);
  const data = SCENARIOS[scenarioIdx].data;

  function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  }

  useEffect(() => {
    setRefreshing(true);
    const t = setTimeout(() => setRefreshing(false), 900);
    return () => clearTimeout(t);
  }, [scenarioIdx]);

  return (
    <section aria-labelledby="trust-engine-heading" className={className}>
      {/* Section header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-muted border border-accent-border">
            <svg className="w-3.5 h-3.5 text-accent" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 1.5C5 1.5 2.5 4 2.5 7c0 2.2 1.2 4.1 3 5.1V14h5v-1.9c1.8-1 3-2.9 3-5.1 0-3-2.5-5.5-5.5-5.5z" />
              <path d="M6 10h4" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h2 id="trust-engine-heading" className="text-sm font-semibold text-ink-primary leading-none mb-0.5">
              Adaptive Trust Engine
            </h2>
            <p className="text-xs text-ink-muted leading-none">Real-time contextual security decisions</p>
          </div>
          <span className="rounded-full bg-accent-muted border border-accent-border px-2 py-0.5 text-2xs font-semibold text-accent">
            Demo
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <ScenarioPicker active={scenarioIdx} onChange={setScenarioIdx} />
          <button
            id="trust-engine-refresh-btn"
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="
              inline-flex items-center gap-1.5 rounded-lg border border-border
              bg-surface-elevated px-3 py-1.5 text-xs font-medium text-ink-secondary
              hover:bg-surface-subtle hover:text-ink-primary
              transition-all duration-150 shadow-xs
              disabled:opacity-60 disabled:cursor-not-allowed
            "
          >
            <span
              className={`flex h-2 w-2 rounded-full transition-colors duration-300 ${refreshing ? 'bg-accent animate-pulse' : 'bg-success'}`}
              aria-hidden="true"
            />
            {refreshing ? 'Evaluating…' : 'Re-evaluate'}
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="mb-4 rounded-lg border border-border bg-surface-elevated px-4 py-3 flex items-start gap-3 shadow-xs">
        <svg className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="5.5" />
          <path d="M8 5.5v3M8 10.5h.01" strokeLinecap="round" />
        </svg>
        <p className="text-xs text-ink-secondary leading-5">
          This section visualises how TrustLine evaluates contextual risk signals to make security decisions.{' '}
          <span className="font-medium text-ink-primary">Mock data only</span> — switch scenarios above to explore different risk profiles.
          Backend integration will replace the demo data.
        </p>
      </div>

      {/* Three-card grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-1">
          <TrustScoreCard data={data} />
        </div>
        <div className="sm:col-span-1">
          <ExplainabilityCard data={data} />
        </div>
        <div className="sm:col-span-2 lg:col-span-1">
          <DecisionCard data={data} />
        </div>
      </div>
    </section>
  );
}
