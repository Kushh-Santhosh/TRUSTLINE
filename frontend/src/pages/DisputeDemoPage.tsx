/**
 * M8.4 — Dispute Resolution Demo Screen
 * Dep: M6.7 (receipt endpoint)
 *
 * Flow:
 *   1. Load resolved approval requests → pick one
 *   2. Show an approver "claiming" they never approved it
 *   3. Fetch the cryptographic receipt (GET /api/ledger/receipt/:id)
 *   4. Display signatures, public keys, and audit-chain evidence
 *   5. Confirm the claim is false — the evidence is immutable
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, authedGet } from '../lib/apiClient';
import { getAccessToken } from '../lib/auth';

// ── Types ─────────────────────────────────────────────────────────────────

interface ApprovalRequest {
  id: string;
  status: string;
  action_payload: unknown;
  created_at: string;
  resolved_at: string | null;
  requester_id: string;
}

interface VoteWithKey {
  id: string;
  approver_id: string;
  decision: string;
  signature: string;
  public_key: string | null;
  created_at: string;
}

interface AuditEntry {
  id: string | number;
  entry_type: string;
  payload: unknown;
  prev_hash: string | null;
  this_hash: string;
  created_at: string;
}

interface Receipt {
  request_id: string;
  votes: VoteWithKey[];
  audit_entries: AuditEntry[];
}

type Phase = 'pick' | 'claim' | 'reveal';

// ── Helpers ───────────────────────────────────────────────────────────────

function shortId(id: string) {
  return id.slice(0, 8) + '…';
}

function shortHash(h: string | null) {
  if (!h) return 'GENESIS';
  return h.slice(0, 12) + '…' + h.slice(-6);
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: 'bg-success-muted text-success border-success-border',
    denied:   'bg-danger-muted text-danger border-danger-border',
    pending:  'bg-warning-muted text-warning border-warning-border',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-semibold ${map[status] ?? 'bg-surface-subtle text-ink-muted border-border'}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // The displayed value remains available for manual copying when clipboard access is unavailable.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded-md border border-border bg-surface-elevated px-2 py-1 text-2xs font-medium text-ink-secondary transition-colors hover:bg-surface-subtle hover:text-ink-primary"
      aria-label={`Copy ${label}`}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function CryptoValue({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <p className="text-2xs font-medium uppercase tracking-wider text-ink-muted">{label}</p>
        <CopyButton value={value} label={label} />
      </div>
      <code className={`block rounded-md border border-border bg-surface-subtle px-3 py-2 font-mono text-xs leading-5 text-ink-secondary ${compact ? 'break-all' : 'max-h-36 overflow-auto whitespace-pre-wrap break-all'}`}>
        {compact ? shortHash(value) : value}
      </code>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export default function DisputeDemoPage() {
  const [requests, setRequests]   = useState<ApprovalRequest[]>([]);
  const [loading, setLoading]     = useState(true);
  const [loadErr, setLoadErr]     = useState('');

  const [selected, setSelected]   = useState<ApprovalRequest | null>(null);
  const [phase, setPhase]         = useState<Phase>('pick');

  const [receipt, setReceipt]     = useState<Receipt | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptErr, setReceiptErr] = useState('');

  // ── Fetch resolved requests on mount ──────────────────────────────────────
  useEffect(() => {
    async function load() {
      const token = getAccessToken();
      if (!token) {
        setLoadErr('401: Not signed in — please sign in first.');
        setLoading(false);
        return;
      }
      try {
        const rows = await authedGet<ApprovalRequest[]>('/api/approval/requests', token);
        setRequests(rows);
      } catch (err) {
        setLoadErr(
          err instanceof ApiError
            ? `${err.status}: ${err.message}`
            : 'Failed to load requests'
        );
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Pick a request ───────────────────────────────────────────────────────
  function pickRequest(r: ApprovalRequest) {
    setSelected(r);
    setPhase('claim');
    setReceipt(null);
    setReceiptErr('');
  }

  // ── Reveal receipt ─────────────────────────────────────────────────────────
  async function revealReceipt() {
    if (!selected) return;
    const token = getAccessToken();
    if (!token) {
      setReceiptErr('Not signed in — please sign in first.');
      return;
    }
    setReceiptLoading(true);
    setReceiptErr('');
    try {
      const data = await authedGet<Receipt>(`/api/ledger/receipt/${selected.id}`, token);
      setReceipt(data);
      setPhase('reveal');
    } catch (err) {
      setReceiptErr(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to load receipt');
    } finally {
      setReceiptLoading(false);
    }
  }

  function reset() {
    setSelected(null);
    setPhase('pick');
    setReceipt(null);
    setReceiptErr('');
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface-base px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-8">

        {/* Page header */}
        <div className="border-b border-border pb-5">
          <span className="inline-flex items-center rounded-full border border-accent-border bg-accent-muted px-2 py-0.5 text-2xs font-semibold text-accent">
            Demo Feature
          </span>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink-primary">Dispute Resolution</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-secondary">
            An approver claims they never approved a request. TrustLine reveals the
            cryptographic receipt — signed evidence that cannot be repudiated.
          </p>
        </div>

        {/* ── Phase 1: Pick a request ── */}
        {phase === 'pick' && (
          <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-xs">
            <div className="border-b border-border px-5 py-4 sm:px-6">
              <h2 className="text-base font-semibold text-ink-primary">Select a resolved request</h2>
              <p className="text-sm text-ink-secondary mt-0.5">
                Choose any resolved request to demonstrate dispute resolution.
              </p>
            </div>

            <div className="px-5 py-5 sm:px-6">
              {loading && (
                <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-center gap-3 px-4 py-4">
                      <div className="h-5 w-16 animate-pulse rounded-full bg-surface-subtle" />
                      <div className="min-w-0 flex-1 space-y-2"><div className="h-3 w-32 animate-pulse rounded bg-surface-subtle" /><div className="h-2.5 w-44 animate-pulse rounded bg-surface-subtle" /></div>
                    </div>
                  ))}
                </div>
              )}
              {loadErr && (
                <div className="rounded-lg border border-danger-border bg-danger-muted px-4 py-3 text-sm text-danger">
                  <p className="font-medium">Unable to load resolved requests</p>
                  <p className="mt-0.5 text-xs">{loadErr}
                  {loadErr.includes('401') && (
                    <span> — <a href="/login" className="underline underline-offset-2">Sign in</a> to continue.</span>
                  )}
                  </p>
                </div>
              )}
              {!loading && !loadErr && requests.length === 0 && (
                <div className="flex flex-col items-center px-6 py-14 text-center">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-subtle text-ink-muted">
                    <svg className="h-5 w-5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="2" width="10" height="12" rx="1.5" /><path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" strokeLinecap="round" /></svg>
                  </div>
                  <p className="text-sm font-medium text-ink-primary">No resolved requests</p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">
                    Create and approve a request from the Dashboard first.
                  </p>
                  <Link to="/dashboard" className="mt-3 text-xs text-accent hover:underline">
                    Go to Dashboard →
                  </Link>
                </div>
              )}
              {!loading && requests.length > 0 && (
                <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {requests.map((r) => (
                    <button
                      key={r.id}
                      id={`pick-request-${r.id}`}
                      type="button"
                      onClick={() => pickRequest(r)}
                      className="flex w-full items-center gap-4 px-4 py-4 text-left transition-colors duration-150 hover:bg-surface-subtle"
                    >
                      <StatusPill status={r.status} />
                      <span className="flex-1 min-w-0">
                        <span className="block font-mono text-sm font-medium text-ink-primary">
                          {shortId(r.id)}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-muted">
                          {new Date(r.created_at).toLocaleString()}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-medium text-accent">View receipt →</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Phase 2: Approver claims denial ── */}
        {phase === 'claim' && selected && (
          <div className="space-y-4">
            {/* Claim card */}
            <div className="overflow-hidden rounded-xl border border-danger-border bg-danger-muted">
              <div className="flex items-center gap-2 border-b border-danger-border px-5 py-4 sm:px-6">
                <span className="text-danger text-sm" aria-hidden="true">!</span>
                <h2 className="text-base font-semibold text-danger">Approver's Claim</h2>
              </div>
              <div className="px-5 py-5 sm:px-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-danger-border bg-surface-elevated text-danger">
                    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="5" r="2.5" /><path d="M3.5 14c.4-2.5 2-3.75 4.5-3.75S12.1 11.5 12.5 14" strokeLinecap="round" /></svg>
                  </div>
                  <blockquote className="italic text-ink-secondary text-sm leading-relaxed border-l-2 border-danger/30 pl-4">
                    "I never approved request{' '}
                    <code className="not-italic font-mono text-xs bg-surface-elevated px-1.5 py-0.5 rounded border border-border">
                      {shortId(selected.id)}
                    </code>
                    . I have no record of this. Someone must have acted on my behalf."
                  </blockquote>
                </div>
                <p className="text-xs text-ink-muted mt-3">
                  — Requester ID: <span className="font-mono">{shortId(selected.requester_id)}</span>
                </p>
              </div>
            </div>

            {receiptErr && (
              <div className="rounded-lg border border-danger-border bg-danger-muted px-4 py-3 text-sm text-danger">
                <p className="font-medium">Unable to retrieve receipt</p>
                <p className="mt-0.5 text-xs">{receiptErr}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                id="btn-reveal-receipt"
                type="button"
                disabled={receiptLoading}
                onClick={revealReceipt}
                className="rounded-lg bg-ink-primary px-4 py-2.5 text-sm font-medium text-ink-inverted transition-colors duration-150 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {receiptLoading ? 'Loading receipt…' : 'Reveal cryptographic receipt'}
              </button>
              <button
                type="button"
                onClick={reset}
                className="rounded-lg border border-border text-sm font-medium px-5 py-2.5 text-ink-secondary hover:bg-surface-subtle transition-colors duration-150"
              >
                ← Back
              </button>
            </div>
          </div>
        )}

        {/* ── Phase 3: Receipt revealed ── */}
        {phase === 'reveal' && receipt && (
          <div className="space-y-5">

            {/* Receipt status: the backend returns evidence but no independent verification result. */}
            <div className="flex items-start gap-3 rounded-xl border border-accent-border bg-accent-muted px-5 py-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent-border bg-surface-elevated text-accent">
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 2.5h6l2 2V13a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 4 13V2.5Z" /><path d="M6 8h4M6 10.5h4" strokeLinecap="round" /></svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-primary">Cryptographic receipt retrieved</p>
                <p className="mt-1 text-sm leading-6 text-ink-secondary">
                  This receipt contains the returned signed votes and hash-linked audit records. No independent signature or chain verification result was returned by the API.
                </p>
              </div>
            </div>

            {/* Votes & signatures */}
            <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-xs">
              <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
                <h2 className="text-base font-semibold text-ink-primary">Approval Votes & Signatures</h2>
                <span className="text-xs text-ink-muted">
                  {receipt.votes.length} vote{receipt.votes.length !== 1 ? 's' : ''}
                </span>
              </div>

              {receipt.votes.length === 0 ? (
                <p className="px-5 py-12 text-center text-sm text-ink-muted sm:px-6">No votes were returned for this request.</p>
              ) : (
                <div className="divide-y divide-border">
                  {receipt.votes.map((v) => (
                    <div key={v.id} className="space-y-4 px-5 py-5 sm:px-6">
                      <div className="flex flex-wrap items-center gap-3">
                        <StatusPill status={v.decision === 'approve' ? 'approved' : 'denied'} />
                        <span className="font-mono text-sm text-ink-secondary">
                          {shortId(v.approver_id)}
                        </span>
                        <span className="ml-auto font-mono text-xs text-ink-muted">
                          {new Date(v.created_at).toLocaleString()}
                        </span>
                      </div>

                      <CryptoValue label="Ed25519 signature" value={v.signature || '(none)'} />

                      {v.public_key && (
                        <CryptoValue label="Approver public key (PEM)" value={v.public_key} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Audit chain */}
            <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-xs">
              <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
                <h2 className="text-base font-semibold text-ink-primary">Audit Chain Evidence</h2>
                <span className="text-xs text-ink-muted">
                  {receipt.audit_entries.length} entr{receipt.audit_entries.length !== 1 ? 'ies' : 'y'}
                </span>
              </div>

              {receipt.audit_entries.length === 0 ? (
                <p className="px-5 py-12 text-center text-sm text-ink-muted sm:px-6">No audit entries were returned for this request.</p>
              ) : (
                <div className="divide-y divide-border">
                  {receipt.audit_entries.map((e) => (
                    <div key={String(e.id)} className="space-y-4 px-5 py-5 sm:px-6">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-md border border-accent-border bg-accent-muted px-2 py-0.5 font-mono text-2xs font-medium text-accent">
                          {e.entry_type}
                        </span>
                        <span className="font-mono text-xs text-ink-muted">
                          {new Date(e.created_at).toLocaleString()}
                        </span>
                        <span className="ml-auto font-mono text-2xs text-ink-muted">Entry {shortId(String(e.id))}</span>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        {e.prev_hash ? <CryptoValue label="Previous hash" value={e.prev_hash} compact /> : (
                          <div><p className="mb-1.5 text-2xs font-medium uppercase tracking-wider text-ink-muted">Previous hash</p><code className="block rounded-md border border-border bg-surface-subtle px-3 py-2 font-mono text-xs text-ink-secondary">GENESIS</code></div>
                        )}
                        <CryptoValue label="Current hash" value={e.this_hash} compact />
                      </div>

                      <details className="text-xs">
                        <summary className="cursor-pointer select-none font-medium text-ink-secondary hover:text-ink-primary">
                          Show payload
                        </summary>
                        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface-subtle px-3 py-2.5 font-mono text-xs leading-5 text-ink-secondary">
                          {JSON.stringify(e.payload, null, 2)}
                        </pre>
                      </details>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-border text-sm font-medium px-5 py-2.5 text-ink-secondary hover:bg-surface-subtle transition-colors duration-150"
            >
              ← Start over
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
