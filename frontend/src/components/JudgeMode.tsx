/**
 * JudgeMode — guided one-click demo orchestrator
 *
 * Orchestrates AdaptiveTrustEngine, TrustTimeline, and AttackSimulation
 * without duplicating their code. Adds a hero section, a step-progress
 * bar, smooth auto-scroll, pause/resume/restart controls, and a final
 * success summary card.
 *
 * MOCK / DEMO ONLY — no backend calls.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import AdaptiveTrustEngine from './AdaptiveTrustEngine';
import TrustTimeline       from './TrustTimeline';
import AttackSimulation    from './AttackSimulation';

// ─────────────────────────────────────────────────────────────────────────────
// Demo step definitions
// ─────────────────────────────────────────────────────────────────────────────

interface DemoStep {
  id: string;
  phase: string;           // shown in progress bar
  title: string;           // shown in the step callout
  description: string;
  durationMs: number;      // how long to dwell on this step
  sectionId?: string;      // scroll target (id on a DOM element)
}

const DEMO_STEPS: DemoStep[] = [
  {
    id: 's1',
    phase: 'Authentication',
    title: 'Step 1 — User authenticated with Passkey',
    description:
      'User signs in using a FIDO2 passkey. No password is ever transmitted — hardware-bound cryptographic proof.',
    durationMs: 3000,
    sectionId: 'judge-hero',
  },
  {
    id: 's2',
    phase: 'Trust Evaluation',
    title: 'Step 2 — Adaptive Trust Engine evaluates session',
    description:
      'The engine inspects device fingerprint, geolocation, time-of-day, and active approval risk. A real-time trust score is computed.',
    durationMs: 3500,
    sectionId: 'judge-trust-engine',
  },
  {
    id: 's3',
    phase: 'Trust Evaluation',
    title: 'Step 3 — Trust Timeline becomes active',
    description:
      'Every contextual event is appended to the session trust timeline, creating an immutable audit trail of how trust evolved.',
    durationMs: 3000,
    sectionId: 'judge-trust-timeline',
  },
  {
    id: 's4',
    phase: 'Attack Detection',
    title: 'Step 4 — Attack simulation runs automatically',
    description:
      'A synthetic phishing / session-hijack attempt is injected. Watch the engine evaluate each signal in real-time.',
    durationMs: 4000,
    sectionId: 'judge-attack-sim',
  },
  {
    id: 's5',
    phase: 'Attack Detection',
    title: 'Step 5 — Trust Score recalculated under threat',
    description:
      'Risk signals drop the trust score from the initial baseline. The engine re-evaluates after every new signal.',
    durationMs: 3000,
    sectionId: 'judge-attack-sim',
  },
  {
    id: 's6',
    phase: 'Decision',
    title: 'Step 6 — Security decision displayed',
    description:
      'Based on the updated score the engine decides: Continue, Additional Verification Required, or Approval Blocked.',
    durationMs: 3000,
    sectionId: 'judge-attack-sim',
  },
  {
    id: 's7',
    phase: 'Audit Proof',
    title: 'Step 7 — Cryptographic receipt generated',
    description:
      'An Ed25519-signed receipt is appended to the hash-chained audit log. Every event is tamper-evident.',
    durationMs: 3000,
    sectionId: 'judge-trust-timeline',
  },
  {
    id: 's8',
    phase: 'Audit Proof',
    title: 'Step 8 — Demo completed successfully',
    description:
      'TrustLine continuously evaluated trust, detected the attack, enforced a security decision, and recorded an immutable proof.',
    durationMs: 2500,
    sectionId: 'judge-summary',
  },
];

// Unique phase labels in order
const PHASES = Array.from(
  new Map(DEMO_STEPS.map((s) => [s.phase, s.phase])).values(),
);

// ─────────────────────────────────────────────────────────────────────────────
// Summary achievements
// ─────────────────────────────────────────────────────────────────────────────

const SUMMARY_ITEMS = [
  { label: 'Session Protected',             sub: 'Passkey auth + device fingerprint verified' },
  { label: 'Attack Detected',               sub: 'Phishing / hijack signals flagged in real-time' },
  { label: 'Trust Continuously Evaluated',  sub: 'Score updated at every contextual event' },
  { label: 'Cryptographic Audit Recorded',  sub: 'Ed25519-signed, tamper-evident audit chain' },
  { label: 'Security Decision Enforced',    sub: 'Engine output: step-up or block in < 50 ms' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

function smoothScrollTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const HEADER_HEIGHT = 72; // sticky nav (56px) + control bar margin
  const top = el.getBoundingClientRect().top + window.scrollY - HEADER_HEIGHT;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress bar
// ─────────────────────────────────────────────────────────────────────────────

function ProgressBar({
  activeStep,
  totalSteps,
  currentPhase,
}: {
  activeStep: number;
  totalSteps: number;
  currentPhase: string;
}) {
  const pct = Math.round(((activeStep + 1) / totalSteps) * 100);

  return (
    <div className="space-y-2">
      {/* Phase pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {PHASES.map((phase, i) => {
          const phaseSteps = DEMO_STEPS.filter((s) => s.phase === phase);
          const firstIdx   = DEMO_STEPS.findIndex((s) => s.phase === phase);
          const lastIdx    = firstIdx + phaseSteps.length - 1;
          const done       = activeStep > lastIdx;
          const active     = activeStep >= firstIdx && activeStep <= lastIdx;

          return (
            <div key={phase} className="flex items-center gap-1.5">
              <span
                className={`
                  inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium
                  transition-all duration-300
                  ${done
                    ? 'bg-success-muted border-success-border text-success'
                    : active
                    ? 'bg-accent-muted border-accent-border text-accent'
                    : 'bg-surface-subtle border-border text-ink-muted'}
                `}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full transition-colors duration-300
                    ${done ? 'bg-success' : active ? 'bg-accent animate-pulse' : 'bg-ink-muted/40'}`}
                  aria-hidden="true"
                />
                {phase}
              </span>
              {i < PHASES.length - 1 && (
                <svg className="w-3 h-3 text-ink-muted/40 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          );
        })}

        {/* Step counter */}
        <span className="ml-auto font-mono text-2xs text-ink-muted tabular-nums shrink-0">
          {activeStep + 1} / {totalSteps}
        </span>
      </div>

      {/* Progress track */}
      <div className="h-1.5 w-full rounded-full overflow-hidden bg-surface-subtle">
        <div
          className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Demo progress: ${pct}%`}
        />
      </div>

      {/* Current phase label */}
      {currentPhase && (
        <p className="text-2xs font-medium text-ink-muted">
          Current phase: <span className="text-ink-primary">{currentPhase}</span>
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step callout (the animated narration bubble)
// ─────────────────────────────────────────────────────────────────────────────

function StepCallout({ step, index }: { step: DemoStep; index: number }) {
  return (
    <div
      key={step.id}
      className="
        flex items-start gap-4 rounded-xl border border-accent-border
        bg-accent-muted/60 px-5 py-4
        animate-[fadeSlideIn_0.4s_ease_both]
      "
    >
      {/* Step number badge */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-ink-inverted text-xs font-bold shadow-sm">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink-primary mb-0.5">{step.title}</p>
        <p className="text-xs leading-5 text-ink-secondary">{step.description}</p>
      </div>
      {/* Animated ping */}
      <div className="relative flex h-3 w-3 shrink-0 mt-1">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-50" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Control bar
// ─────────────────────────────────────────────────────────────────────────────

type DemoState = 'idle' | 'running' | 'paused' | 'done';

function ControlBar({
  state,
  onPause,
  onResume,
  onRestart,
}: {
  state: DemoState;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
}) {
  if (state === 'idle') return null;

  const btnBase =
    'inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-medium transition-all duration-150 shadow-xs';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {state === 'running' && (
        <button
          id="judge-pause-btn"
          type="button"
          onClick={onPause}
          className={`${btnBase} border-border bg-surface-elevated text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="2" width="3.5" height="10" rx="1" fill="currentColor" stroke="none" />
            <rect x="8.5" y="2" width="3.5" height="10" rx="1" fill="currentColor" stroke="none" />
          </svg>
          Pause
        </button>
      )}
      {state === 'paused' && (
        <button
          id="judge-resume-btn"
          type="button"
          onClick={onResume}
          className={`${btnBase} border-accent-border bg-accent-muted text-accent hover:bg-accent hover:text-ink-inverted`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 2l9 5-9 5V2z" fill="currentColor" stroke="none" />
          </svg>
          Resume
        </button>
      )}
      {(state === 'running' || state === 'paused' || state === 'done') && (
        <button
          id="judge-restart-btn"
          type="button"
          onClick={onRestart}
          className={`${btnBase} border-border bg-surface-elevated text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 7A5 5 0 0110 3.2" strokeLinecap="round" />
            <path d="M8 1.5l2 1.7-1.7 2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 7A5 5 0 014 10.8" strokeLinecap="round" />
            <path d="M6 12.5L4 10.8l1.7-2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Restart Demo
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Success summary
// ─────────────────────────────────────────────────────────────────────────────

function SummaryCard() {
  return (
    <div
      id="judge-summary"
      className="
        rounded-xl border border-success-border bg-success-muted
        p-6 animate-[fadeSlideIn_0.5s_ease_both]
      "
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success text-ink-inverted shadow-sm">
          <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 10l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <h3 className="text-base font-bold text-success leading-none mb-0.5">
            Demo Completed Successfully
          </h3>
          <p className="text-xs text-success/70">
            TrustLine protected this session end-to-end
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SUMMARY_ITEMS.map((item, i) => (
          <div
            key={item.label}
            className="
              flex items-start gap-3 rounded-lg border border-success-border/60
              bg-surface-elevated px-4 py-3
              animate-[fadeSlideIn_0.4s_ease_both]
            "
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success mt-0.5">
              <svg className="w-3 h-3 text-ink-inverted" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M2 6l2.5 2.5L10 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-primary leading-none mb-0.5">
                {item.label}
              </p>
              <p className="text-2xs text-ink-muted leading-4">{item.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section wrapper — adds an id anchor so auto-scroll can find it
// ─────────────────────────────────────────────────────────────────────────────

function AnchoredSection({
  anchorId,
  highlight,
  children,
}: {
  anchorId: string;
  highlight: boolean;
  children: ReactNode;
}) {
  return (
    <div
      id={anchorId}
      className={`
        rounded-2xl transition-all duration-700 ease-in-out
        ${highlight
          ? 'ring-2 ring-accent/50 ring-offset-4 ring-offset-surface-base shadow-[0_0_0_4px_rgba(37,99,235,.06)]'
          : 'ring-0 shadow-none'}
      `}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

interface JudgeModeProps {
  className?: string;
}

export default function JudgeMode({ className = '' }: JudgeModeProps) {
  const [demoState, setDemoState]       = useState<DemoState>('idle');
  const [activeStep, setActiveStep]     = useState(-1);
  const [showSummary, setShowSummary]   = useState(false);

  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef  = useRef(false);
  const stepRef    = useRef(-1);

  // ── Timer helpers ──────────────────────────────────────────────────────────

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  // Advance one step; respects pause flag
  const advanceStep = useCallback((idx: number) => {
    if (idx >= DEMO_STEPS.length) {
      setShowSummary(true);
      setDemoState('done');
      smoothScrollTo('judge-summary');
      return;
    }

    stepRef.current = idx;
    setActiveStep(idx);

    const step = DEMO_STEPS[idx];
    if (step.sectionId) smoothScrollTo(step.sectionId);

    timerRef.current = setTimeout(() => {
      if (!pausedRef.current) advanceStep(idx + 1);
      // if paused, the Resume handler will call advanceStep(idx + 1)
    }, step.durationMs);
  }, []);

  // ── Controls ───────────────────────────────────────────────────────────────

  function startDemo() {
    clearTimer();
    pausedRef.current = false;
    setDemoState('running');
    setShowSummary(false);
    setActiveStep(-1);
    // Small delay so the UI settles before step 0
    timerRef.current = setTimeout(() => advanceStep(0), 400);
    smoothScrollTo('judge-hero');
  }

  function pauseDemo() {
    pausedRef.current = true;
    clearTimer();
    setDemoState('paused');
  }

  function resumeDemo() {
    pausedRef.current = false;
    setDemoState('running');
    // Advance to the NEXT step from where we paused
    advanceStep(stepRef.current + 1);
  }

  function restartDemo() {
    clearTimer();
    pausedRef.current = false;
    setDemoState('idle');
    setActiveStep(-1);
    setShowSummary(false);
    stepRef.current = -1;
    smoothScrollTo('judge-mode-section');
  }

  // Cleanup on unmount
  useEffect(() => () => clearTimer(), [clearTimer]);

  // ── Derived values ─────────────────────────────────────────────────────────

  const currentStep   = activeStep >= 0 ? DEMO_STEPS[activeStep] : null;
  const currentPhase  = currentStep?.phase ?? '';

  // Which section anchors are "active" for the ring highlight
  const activeSectionId = currentStep?.sectionId;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section
      id="judge-mode-section"
      aria-labelledby="judge-mode-heading"
      className={className}
    >
      {/* ── Section label ── */}
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-primary">
          <svg className="w-3.5 h-3.5 text-ink-inverted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M5 3.5l7 4.5-7 4.5V3.5z" fill="currentColor" stroke="none" />
          </svg>
        </div>
        <div>
          <h2 id="judge-mode-heading" className="text-sm font-semibold text-ink-primary leading-none mb-0.5">
            Judge Mode
          </h2>
          <p className="text-xs text-ink-muted leading-none">Guided one-click product demonstration</p>
        </div>
        <span className="rounded-full bg-ink-primary px-2 py-0.5 text-2xs font-semibold text-ink-inverted ml-1">
          Demo
        </span>
      </div>

      {/* ── Outer card ── */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-md">

        {/* ── Hero ── */}
        <div
          id="judge-hero"
          className="
            relative overflow-hidden
            bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900
            px-6 py-12 sm:px-10 sm:py-16
          "
        >
          {/* Subtle grid pattern */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
            aria-hidden="true"
          />
          {/* Glow */}
          <div
            className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #2563eb 0%, transparent 70%)' }}
            aria-hidden="true"
          />

          <div className="relative z-10 flex flex-col items-center text-center gap-6 max-w-2xl mx-auto">
            {/* Logo mark */}
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 border border-white/20 shadow-lg backdrop-blur-sm">
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2C8 2 4 5 4 9c0 5 8 13 8 13s8-8 8-13c0-4-4-7-8-7z" />
                <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            {/* Heading */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                Guided Security Demo
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight tracking-tight mb-3">
                TrustLine Guided Security Demonstration
              </h1>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-lg mx-auto">
                Authenticate once. Verify continuously. Every enterprise approval is guarded by real-time adaptive trust — evaluated fresh at every step.
              </p>
            </div>

            {/* Big CTA */}
            {demoState === 'idle' ? (
              <button
                id="judge-run-demo-btn"
                type="button"
                onClick={startDemo}
                className="
                  inline-flex items-center gap-3 rounded-xl
                  bg-white px-8 py-4 text-base font-bold text-slate-900
                  hover:bg-slate-100 active:scale-[0.98]
                  shadow-xl hover:shadow-2xl
                  transition-all duration-200
                  focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40
                "
              >
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6 4l12 6-12 6V4z" />
                </svg>
                Run Complete Demo
              </button>
            ) : (
              <div className="flex flex-col items-center gap-3">
                {/* Running state badge */}
                {demoState === 'running' && (
                  <div className="flex items-center gap-2 rounded-full bg-white/10 border border-white/20 px-4 py-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-400" />
                    </span>
                    <span className="text-sm font-medium text-white">Demo running…</span>
                  </div>
                )}
                {demoState === 'paused' && (
                  <div className="flex items-center gap-2 rounded-full bg-white/10 border border-white/20 px-4 py-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                    <span className="text-sm font-medium text-white">Demo paused</span>
                  </div>
                )}
                {demoState === 'done' && (
                  <div className="flex items-center gap-2 rounded-full bg-green-500/20 border border-green-400/40 px-4 py-2">
                    <svg className="w-4 h-4 text-green-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-sm font-medium text-green-300">Demo completed!</span>
                  </div>
                )}
              </div>
            )}

            {/* Estimated time note */}
            <p className="text-xs text-slate-400">
              ⏱ Approximately 30 seconds · Mock data only · No backend calls
            </p>
          </div>
        </div>

        {/* ── Sticky control bar (visible once demo starts) ── */}
        {demoState !== 'idle' && (
          <div className="sticky top-14 z-10 border-b border-border bg-surface-elevated/95 backdrop-blur-sm px-5 py-3 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Progress */}
              <div className="flex-1 min-w-0 max-w-2xl">
                <ProgressBar
                  activeStep={Math.max(activeStep, 0)}
                  totalSteps={DEMO_STEPS.length}
                  currentPhase={currentPhase}
                />
              </div>
              {/* Controls */}
              <div className="shrink-0">
                <ControlBar
                  state={demoState}
                  onPause={pauseDemo}
                  onResume={resumeDemo}
                  onRestart={restartDemo}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Step callout (narration bubble) ── */}
        {currentStep && demoState !== 'idle' && (
          <div className="px-5 py-4 sm:px-6 border-b border-border bg-surface-subtle/60">
            <StepCallout key={currentStep.id} step={currentStep} index={activeStep} />
          </div>
        )}

        {/* ── Orchestrated sections ── */}
        <div className="divide-y divide-border">

          {/* 1 — Adaptive Trust Engine */}
          <div className="px-5 py-6 sm:px-6">
            <AnchoredSection
              anchorId="judge-trust-engine"
              highlight={activeSectionId === 'judge-trust-engine'}
            >
              <AdaptiveTrustEngine />
            </AnchoredSection>
          </div>

          {/* 2 — Trust Timeline */}
          <div className="px-5 py-6 sm:px-6">
            <AnchoredSection
              anchorId="judge-trust-timeline"
              highlight={activeSectionId === 'judge-trust-timeline'}
            >
              <TrustTimeline />
            </AnchoredSection>
          </div>

          {/* 3 — Attack Simulation */}
          <div className="px-5 py-6 sm:px-6">
            <AnchoredSection
              anchorId="judge-attack-sim"
              highlight={activeSectionId === 'judge-attack-sim'}
            >
              <AttackSimulation />
            </AnchoredSection>
          </div>

          {/* 4 — Summary card (only after demo completes) */}
          {showSummary && (
            <div className="px-5 py-6 sm:px-6">
              <SummaryCard />
            </div>
          )}

        </div>

        {/* ── Card footer ── */}
        <div className="px-5 py-4 border-t border-border bg-surface-subtle/40 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
            <p className="text-xs text-ink-muted">
              Judge Mode — <span className="font-medium text-ink-secondary">mock data only</span>.
              All components are individually reusable and API-ready.
            </p>
            {demoState === 'idle' && (
              <button
                type="button"
                onClick={startDemo}
                id="judge-footer-run-btn"
                className="ml-auto text-xs font-medium text-accent hover:text-accent-hover underline underline-offset-2 transition-colors"
              >
                ▶ Run Demo
              </button>
            )}
            {demoState !== 'idle' && (
              <button
                type="button"
                onClick={restartDemo}
                id="judge-footer-restart-btn"
                className="ml-auto text-xs font-medium text-ink-muted hover:text-ink-primary underline underline-offset-2 transition-colors"
              >
                ↺ Restart
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
