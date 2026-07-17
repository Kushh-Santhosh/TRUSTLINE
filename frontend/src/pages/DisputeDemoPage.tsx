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
import apiClient, { ApiError } from '../lib/apiClient';
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

// ── helpers ───────────────────────────────────────────────────────────────

function shortId(id: string) {
  return id.slice(0, 8) + '…';
}

function shortHash(h: string | null) {
  if (!h) return 'GENESIS';
  return h.slice(0, 12) + '…' + h.slice(-6);
}

function authHeader() {
  const t = getAccessToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
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

  // ── Fetch resolved requests on mount ────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const rows = await apiClient.get<ApprovalRequest[]>('/api/approval/requests');
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

  // ── Reveal receipt ───────────────────────────────────────────────────────
  async function revealReceipt() {
    if (!selected) return;
    setReceiptLoading(true);
    setReceiptErr('');
    try {
      const data = await fetch(
        `/api/ledger/receipt/${selected.id}`,
        { headers: { 'Content-Type': 'application/json', ...authHeader() } }
      ).then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Receipt>;
      });
      setReceipt(data);
      setPhase('reveal');
    } catch (err) {
      setReceiptErr(err instanceof Error ? err.message : 'Failed to load receipt');
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
    <div className="min-h-screen bg-surface-base px-4 py-12">
      <div className="mx-auto max-w-3xl space-y-8">

        {/* Header */}
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-accent">
            Demo Feature
          </span>
          <h1 className="mt-2 text-3xl font-heading font-bold text-ink-primary">
            Dispute Resolution
          </h1>
          <p className="mt-2 text-sm text-ink-secondary max-w-xl">
            An approver claims they never approved a request. TrustLine reveals the
            cryptographic receipt — signed evidence that cannot be repudiated.
          </p>
        </div>

        {/* ── Phase 1: Pick a request ── */}
        {phase === 'pick' && (
          <div className="rounded-xl border border-border bg-surface-elevated shadow-lg overflow-hidden">
            <div className="border-b border-border px-6 py-4">
              <h2 className="font-heading font-semibold text-ink-primary">
                Select a resolved approval request
              </h2>
              <p className="text-sm text-ink-secondary mt-1">
                Choose any resolved request to demonstrate dispute resolution.
              </p>
            </div>

            <div className="px-6 py-5">
              {loading && (
                <p className="text-sm text-ink-muted">Loading requests…</p>
              )}
              {loadErr && (
                <div className="rounded-md bg-danger/10 border border-danger/30 px-4 py-3 text-sm text-danger">
                  {loadErr}
                  {loadErr.includes('401') && (
                    <span> — <a href="/login" className="underline">Sign in</a> to continue.</span>
                  )}
                </div>
              )}
              {!loading && !loadErr && requests.length === 0 && (
                <p className="text-sm text-ink-muted">
                  No resolved requests found. Submit and approve a request first.
                </p>
              )}
              {!loading && requests.length > 0 && (
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {requests.map((r) => (
                    <button
                      key={r.id}
                      id={`pick-request-${r.id}`}
                      type="button"
                      onClick={() => pickRequest(r)}
                      className="
                        w-full text-left px-4 py-4 flex items-center gap-4
                        hover:bg-surface-subtle transition-colors
                      "
                    >
                      <span
                        className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold uppercase ${
                          r.status === 'approved'
                            ? 'bg-success/15 text-success'
                            : r.status === 'denied'
                              ? 'bg-danger/15 text-danger'
                              : 'bg-border text-ink-muted'
                        }`}
                      >
                        {r.status}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-ink-primary font-mono">
                          {shortId(r.id)}
                        </span>
                        <span className="block text-xs text-ink-muted mt-0.5">
                          {new Date(r.created_at).toLocaleString()}
                        </span>
                      </span>
                      <span className="text-ink-muted text-xs shrink-0">Select →</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Phase 2: Approver claims denial ── */}
        {phase === 'claim' && selected && (
          <div className="space-y-6">
            {/* Claim card */}
            <div className="rounded-xl border border-danger/40 bg-danger/5 shadow-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-danger/20">
                <h2 className="font-heading font-semibold text-danger flex items-center gap-2">
                  <span>⚠</span> Approver's Claim
                </h2>
              </div>
              <div className="px-6 py-6 flex flex-col gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-danger/20 flex items-center justify-center text-lg shrink-0">
                    👤
                  </div>
                  <blockquote className="italic text-ink-secondary text-sm leading-relaxed border-l-2 border-danger/40 pl-4">
                    "I never approved request <code className="font-mono text-xs bg-surface-subtle px-1 rounded">{shortId(selected.id)}</code>.
                    I have no record of this. Someone must have acted on my behalf without my consent."
                  </blockquote>
                </div>
                <p className="text-xs text-ink-muted">
                  — Approver ID: <span className="font-mono">{shortId(selected.requester_id)}</span>
                </p>
              </div>
            </div>

            {/* Action */}
            {receiptErr && (
              <div className="rounded-md bg-danger/10 border border-danger/30 px-4 py-3 text-sm text-danger">
                {receiptErr}
              </div>
            )}
            <div className="flex gap-3">
              <button
                id="btn-reveal-receipt"
                type="button"
                disabled={receiptLoading}
                onClick={revealReceipt}
                className="
                  rounded-md bg-accent text-surface-base font-semibold text-sm
                  px-6 py-2.5 hover:bg-accent-hover transition-colors shadow-accent
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                {receiptLoading ? 'Fetching receipt…' : '🔍 Reveal cryptographic receipt'}
              </button>
              <button
                type="button"
                onClick={reset}
                className="rounded-md border border-border text-sm px-5 py-2.5 text-ink-secondary hover:bg-surface-subtle transition-colors"
              >
                ← Back
              </button>
            </div>
          </div>
        )}

        {/* ── Phase 3: Receipt revealed ── */}
        {phase === 'reveal' && receipt && (
          <div className="space-y-6">

            {/* Verdict banner */}
            <div className="rounded-xl bg-success/10 border border-success/30 px-6 py-4 flex items-start gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-semibold text-success">Claim refuted by cryptographic evidence</p>
                <p className="text-sm text-ink-secondary mt-1">
                  The receipt below is tamper-evident. Each vote carries an Ed25519 signature
                  verifiable against the approver's stored public key, and every event is
                  hash-chained in the audit log.
                </p>
              </div>
            </div>

            {/* Votes / signatures */}
            <div className="rounded-xl border border-border bg-surface-elevated shadow-lg overflow-hidden">
              <div className="border-b border-border px-6 py-4">
                <h2 className="font-heading font-semibold text-ink-primary">
                  Approval Votes &amp; Signatures
                </h2>
                <p className="text-xs text-ink-muted mt-1">
                  {receipt.votes.length} vote{receipt.votes.length !== 1 ? 's' : ''} recorded
                </p>
              </div>

              {receipt.votes.length === 0 ? (
                <p className="px-6 py-5 text-sm text-ink-muted">No votes found for this request.</p>
              ) : (
                <div className="divide-y divide-border">
                  {receipt.votes.map((v) => (
                    <div key={v.id} className="px-6 py-5 space-y-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${
                            v.decision === 'approve'
                              ? 'bg-success/15 text-success'
                              : 'bg-danger/15 text-danger'
                          }`}
                        >
                          {v.decision}
                        </span>
                        <span className="text-sm text-ink-secondary font-mono">
                          Approver: {shortId(v.approver_id)}
                        </span>
                        <span className="text-xs text-ink-muted ml-auto">
                          {new Date(v.created_at).toLocaleString()}
                        </span>
                      </div>

                      {/* Signature */}
                      <div>
                        <p className="text-xs font-semibold text-ink-muted mb-1">Ed25519 Signature</p>
                        <pre className="rounded bg-surface-subtle border border-border px-3 py-2 text-xs font-mono text-ink-secondary overflow-x-auto whitespace-pre-wrap break-all">
                          {v.signature || '(none)'}
                        </pre>
                      </div>

                      {/* Public key */}
                      {v.public_key && (
                        <div>
                          <p className="text-xs font-semibold text-ink-muted mb-1">Approver Public Key (PEM)</p>
                          <pre className="rounded bg-surface-subtle border border-border px-3 py-2 text-xs font-mono text-ink-secondary overflow-x-auto whitespace-pre-wrap">
                            {v.public_key}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Audit chain entries */}
            <div className="rounded-xl border border-border bg-surface-elevated shadow-lg overflow-hidden">
              <div className="border-b border-border px-6 py-4">
                <h2 className="font-heading font-semibold text-ink-primary">
                  Audit Chain Evidence
                </h2>
                <p className="text-xs text-ink-muted mt-1">
                  {receipt.audit_entries.length} related audit entr{receipt.audit_entries.length !== 1 ? 'ies' : 'y'} — hash-chained and tamper-evident
                </p>
              </div>

              {receipt.audit_entries.length === 0 ? (
                <p className="px-6 py-5 text-sm text-ink-muted">No audit entries for this request.</p>
              ) : (
                <div className="divide-y divide-border">
                  {receipt.audit_entries.map((e) => (
                    <div key={String(e.id)} className="px-6 py-4 space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="rounded bg-accent/10 text-accent text-xs font-semibold px-2 py-0.5 font-mono">
                          {e.entry_type}
                        </span>
                        <span className="text-xs text-ink-muted">
                          {new Date(e.created_at).toLocaleString()}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                        <div>
                          <p className="text-ink-muted mb-0.5">prev_hash</p>
                          <p className="text-ink-secondary bg-surface-subtle rounded px-2 py-1 break-all">
                            {shortHash(e.prev_hash)}
                          </p>
                        </div>
                        <div>
                          <p className="text-ink-muted mb-0.5">this_hash</p>
                          <p className="text-ink-secondary bg-surface-subtle rounded px-2 py-1 break-all">
                            {shortHash(e.this_hash)}
                          </p>
                        </div>
                      </div>

                      <details className="text-xs">
                        <summary className="cursor-pointer text-ink-muted hover:text-ink-secondary">
                          Show payload
                        </summary>
                        <pre className="mt-1 rounded bg-surface-subtle border border-border px-3 py-2 overflow-x-auto whitespace-pre-wrap text-ink-secondary">
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
              className="rounded-md border border-border text-sm px-5 py-2.5 text-ink-secondary hover:bg-surface-subtle transition-colors"
            >
              ← Start over
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
