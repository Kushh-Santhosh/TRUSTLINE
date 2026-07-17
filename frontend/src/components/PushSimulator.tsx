/**
 * M8.1 — PushSimulator
 * Simulates a second-device "number-matching" push prompt.
 * Logic unchanged. Layout polished.
 */
import { useMemo, useState } from 'react';

interface PushSimulatorProps {
  targetCode: number;
  onMatch: (correct: boolean) => void;
  disabled?: boolean;
}

function generateDecoys(target: number): [number, number] {
  const decoys: number[] = [];
  while (decoys.length < 2) {
    const n = 10 + Math.floor(Math.random() * 90);
    if (n !== target && !decoys.includes(n)) decoys.push(n);
  }
  return [decoys[0], decoys[1]];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function PushSimulator({ targetCode, onMatch, disabled = false }: PushSimulatorProps) {
  const choices = useMemo(() => {
    const [d1, d2] = generateDecoys(targetCode);
    return shuffle([targetCode, d1, d2]);
  }, [targetCode]);

  const [picked, setPicked] = useState<number | null>(null);

  function handlePick(n: number) {
    if (disabled || picked !== null) return;
    setPicked(n);
    onMatch(n === targetCode);
  }

  const isCorrect = (n: number) => picked !== null && n === targetCode;
  const isWrong   = (n: number) => picked === n && n !== targetCode;

  return (
    <div className="grid gap-4 lg:grid-cols-2">

      {/* ── Left: Browser panel showing the target code ── */}
      <section aria-label="Sign-in request" className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface-subtle p-5">
        <div>
          <p className="mb-1 text-2xs font-medium uppercase tracking-wider text-ink-muted">
            Sign-in request
          </p>
          <p className="text-sm text-ink-secondary">
            Check your authenticator and select the matching number.
          </p>
        </div>
        <div className="mt-auto flex items-center justify-center rounded-lg border border-accent-border bg-accent-muted py-7">
          <span
            className="font-mono text-4xl font-bold tracking-widest text-accent"
            aria-label={`Target code: ${targetCode}`}
          >
            {String(targetCode).padStart(2, '0')}
          </span>
        </div>
      </section>

      {/* ── Right: Simulated phone panel ── */}
      <section aria-label="Authenticator simulator" className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface-elevated p-5 shadow-xs">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
            <p className="text-2xs font-medium uppercase tracking-wider text-ink-muted">
              Authenticator (simulated)
            </p>
          </div>
          <p className="text-sm text-ink-secondary">
            Which number matches your screen?
          </p>
        </div>

        {/* Choice buttons */}
        <div className="grid grid-cols-3 gap-2">
          {choices.map((n) => {
            let cls = 'flex min-h-14 items-center justify-center rounded-lg border py-4 font-mono text-xl font-semibold transition-colors duration-150 select-none focus-visible:ring-2 focus-visible:ring-accent/30';
            if (picked === null) {
              cls += ' cursor-pointer border-border bg-surface-elevated text-ink-primary hover:border-accent hover:bg-accent-muted hover:text-accent';
            } else if (isCorrect(n)) {
              cls += ' cursor-default border-success-border bg-success-muted text-success';
            } else if (isWrong(n)) {
              cls += ' cursor-default border-danger-border bg-danger-muted text-danger';
            } else {
              cls += ' border-border bg-surface-subtle text-ink-muted opacity-40 cursor-default';
            }

            return (
              <button
                key={n}
                id={`push-choice-${n}`}
                type="button"
                disabled={disabled || picked !== null}
                onClick={() => handlePick(n)}
                className={cls}
                aria-label={`Choose number ${n}`}
              >
                {String(n).padStart(2, '0')}
              </button>
            );
          })}
        </div>

        {picked !== null && (
          <p role="status" aria-live="polite" className={`rounded-md px-3 py-2 text-center text-sm font-medium ${picked === targetCode ? 'bg-success-muted text-success' : 'bg-danger-muted text-danger'}`}>
            {picked === targetCode
              ? 'Number matched'
              : 'Incorrect selection — restart the sign-in request'}
          </p>
        )}
      </section>
    </div>
  );
}
