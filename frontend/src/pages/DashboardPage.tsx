/**
 * Dashboard — production-quality implementation
 *
 * Sections:
 *   1. Active Sessions  — fetches GET /api/auth/sessions, allows revoke
 *   2. Pending Approvals — fetches GET /api/approval/requests/pending, allows vote
 *   3. Recent Activity  — fetches GET /api/auth/audit (hash-chained audit log)
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authedGet, authedPost, authedDel, ApiError } from '../lib/apiClient';
import { getAccessToken, clearTokens } from '../lib/auth';

// ── Types ─────────────────────────────────────────────────────────────────

interface Session {
  id: string;
  family_id: string;
  created_at: string;
  expires_at: string;
  ip: string | null;
  user_agent: string | null;
  last_seen: string | null;
}

interface ApprovalRequest {
  id: string;
  policy_id: string;
  requester_id: string;
  action_payload: unknown;
  status: string;
  created_at: string;
  escalated: boolean;
  break_glass: boolean;
}

interface AuditEntry {
  id: string;
  entry_type: string;
  payload: unknown;
  created_at: string;
}

type LoadState<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; data: T };

// ── Helpers ───────────────────────────────────────────────────────────────

function parseUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown device';
  // Simple UA parser — covers the most common cases
  if (/iPhone|iPad/.test(ua)) return 'iPhone / iPad';
  if (/Android/.test(ua)) return 'Android device';
  if (/Chrome/.test(ua) && /Windows/.test(ua)) return 'Chrome on Windows';
  if (/Chrome/.test(ua) && /Mac/.test(ua)) return 'Chrome on macOS';
  if (/Chrome/.test(ua) && /Linux/.test(ua)) return 'Chrome on Linux';
  if (/Firefox/.test(ua)) return 'Firefox';
  if (/Safari/.test(ua) && /Mac/.test(ua)) return 'Safari on macOS';
  if (/Edg/.test(ua)) return 'Microsoft Edge';
  return 'Browser';
}

function maskIp(ip: string | null): string {
  if (!ip) return '—';
  // Mask last octet for IPv4, last segment for IPv6
  const v4 = ip.match(/^(\d+\.\d+\.\d+)\.\d+$/);
  if (v4) return `${v4[1]}.xxx`;
  const v6 = ip.match(/^(.*):[\w]+$/);
  if (v6) return `${v6[1]}:xxxx`;
  return ip;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function auditIcon(entryType: string): string {
  if (entryType === 'login') return '🔓';
  if (entryType.includes('vote')) return '🗳️';
  if (entryType.includes('resolved')) return '✅';
  if (entryType.includes('totp') || entryType.includes('step')) return '🔑';
  if (entryType.includes('register')) return '📱';
  return '📋';
}

function auditLabel(entryType: string): string {
  const labels: Record<string, string> = {
    login: 'Sign-in',
    vote: 'Approval vote',
    request_resolved: 'Request resolved',
    'totp.enabled': 'TOTP enrolled',
    'step_up': 'Step-up auth',
    'webauthn.registered': 'Passkey registered',
  };
  return labels[entryType] ?? entryType.replace(/_/g, ' ');
}

function apiErrorMsg(err: unknown): string {
  if (err instanceof ApiError) {
    return err.body && typeof err.body === 'object' && 'error' in err.body
      ? String((err.body as Record<string, unknown>).error)
      : err.message;
  }
  return err instanceof Error ? err.message : 'An unexpected error occurred';
}

// ── Skeleton ──────────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-border/60 ${className}`}
      aria-hidden="true"
    />
  );
}

function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-6">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-7 w-16 rounded-md shrink-0" />
        </div>
      ))}
    </div>
  );
}

// ── EmptyState ─────────────────────────────────────────────────────────────

function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <span className="text-3xl mb-3" role="img" aria-hidden="true">{icon}</span>
      <p className="text-sm font-medium text-ink-secondary">{title}</p>
      <p className="text-xs text-ink-muted mt-1">{subtitle}</p>
    </div>
  );
}

// ── ErrorState ─────────────────────────────────────────────────────────────

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
      <span className="text-2xl" role="img" aria-hidden="true">⚠️</span>
      <p className="text-sm text-danger">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-xs font-medium text-accent hover:text-accent-hover underline underline-offset-2 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

// ── SectionCard ────────────────────────────────────────────────────────────

function SectionCard({
  id,
  title,
  badge,
  children,
}: {
  id: string;
  title: string;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`}>
      <div className="flex items-center gap-2 mb-3">
        <h2 id={`${id}-heading`} className="text-base font-semibold text-ink-primary">
          {title}
        </h2>
        {badge !== undefined && badge > 0 && (
          <span className="rounded-full bg-accent/15 text-accent text-xs font-semibold px-2 py-0.5 tabular-nums">
            {badge}
          </span>
        )}
      </div>
      <div className="rounded-xl border border-border bg-surface-elevated shadow overflow-hidden">
        {children}
      </div>
    </section>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate();
  const token = getAccessToken();

  const [sessions, setSessions]     = useState<LoadState<Session[]>>({ status: 'loading' });
  const [approvals, setApprovals]   = useState<LoadState<ApprovalRequest[]>>({ status: 'loading' });
  const [activity, setActivity]     = useState<LoadState<AuditEntry[]>>({ status: 'loading' });
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [votingId, setVotingId]     = useState<string | null>(null);

  // ── Data fetchers ────────────────────────────────────────────────────────

  const loadSessions = useCallback(async () => {
    if (!token) { setSessions({ status: 'error', message: 'Not authenticated' }); return; }
    setSessions({ status: 'loading' });
    try {
      const data = await authedGet<Session[]>('/api/auth/sessions', token);
      setSessions({ status: 'ok', data });
    } catch (err) {
      setSessions({ status: 'error', message: apiErrorMsg(err) });
    }
  }, [token]);

  const loadApprovals = useCallback(async () => {
    if (!token) { setApprovals({ status: 'error', message: 'Not authenticated' }); return; }
    setApprovals({ status: 'loading' });
    try {
      const data = await authedGet<ApprovalRequest[]>('/api/approval/requests/pending', token);
      setApprovals({ status: 'ok', data });
    } catch (err) {
      setApprovals({ status: 'error', message: apiErrorMsg(err) });
    }
  }, [token]);

  const loadActivity = useCallback(async () => {
    if (!token) { setActivity({ status: 'error', message: 'Not authenticated' }); return; }
    setActivity({ status: 'loading' });
    try {
      const data = await authedGet<AuditEntry[]>('/api/auth/audit', token);
      setActivity({ status: 'ok', data });
    } catch (err) {
      setActivity({ status: 'error', message: apiErrorMsg(err) });
    }
  }, [token]);

  useEffect(() => {
    if (!token) { navigate('/login'); return; }
    loadSessions();
    loadApprovals();
    loadActivity();
  }, [token, navigate, loadSessions, loadApprovals, loadActivity]);

  // ── Session revocation ──────────────────────────────────────────────────

  async function revokeSession(familyId: string) {
    if (!token || revokingId) return;
    setRevokingId(familyId);
    try {
      await authedDel(`/api/auth/sessions/${familyId}`, token);
      // Optimistically remove from list
      setSessions((prev) =>
        prev.status === 'ok'
          ? { status: 'ok', data: prev.data.filter((s) => s.family_id !== familyId) }
          : prev
      );
    } catch (err) {
      // Re-fetch to get accurate state
      void loadSessions();
      alert(apiErrorMsg(err));
    } finally {
      setRevokingId(null);
    }
  }

  // ── Approval vote ───────────────────────────────────────────────────────

  async function submitVote(requestId: string, decision: 'approve' | 'deny') {
    if (!token || votingId) return;
    setVotingId(requestId);
    try {
      await authedPost(`/api/approval/requests/${requestId}/votes`, token, { decision });
      // Remove from pending list
      setApprovals((prev) =>
        prev.status === 'ok'
          ? { status: 'ok', data: prev.data.filter((r) => r.id !== requestId) }
          : prev
      );
      void loadActivity();
    } catch (err) {
      alert(apiErrorMsg(err));
    } finally {
      setVotingId(null);
    }
  }

  // ── Sign out ────────────────────────────────────────────────────────────

  function handleSignOut() {
    clearTokens();
    navigate('/login');
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const pendingCount = approvals.status === 'ok' ? approvals.data.length : undefined;

  return (
    <div className="min-h-screen bg-surface-base text-ink-primary">

      {/* Top nav */}
      <header className="border-b border-border bg-surface-elevated px-6 py-4 flex items-center justify-between">
        <span className="text-lg font-heading font-semibold tracking-tight">
          Trust<span className="text-accent">Line</span>
        </span>
        <div className="flex items-center gap-4">
          <span className="hidden sm:block text-sm text-ink-secondary">Dashboard</span>
          <button
            id="sign-out-btn"
            type="button"
            onClick={handleSignOut}
            className="
              text-xs font-medium px-3 py-1.5 rounded-md border border-border
              text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary
              transition-colors
            "
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── Active Sessions ── */}
        <SectionCard id="sessions" title="Active Sessions">
          {sessions.status === 'loading' && <SectionSkeleton rows={2} />}
          {sessions.status === 'error' && (
            <ErrorState message={sessions.message} onRetry={loadSessions} />
          )}
          {sessions.status === 'ok' && sessions.data.length === 0 && (
            <EmptyState
              icon="🔐"
              title="No active sessions"
              subtitle="Sessions appear here after you sign in"
            />
          )}
          {sessions.status === 'ok' && sessions.data.length > 0 && (
            <div className="divide-y divide-border">
              {sessions.data.map((session, idx) => {
                const isFirst = idx === 0;
                const device = parseUserAgent(session.user_agent);
                const ip = maskIp(session.ip);
                const created = relativeTime(session.created_at);
                const lastSeen = session.last_seen ? relativeTime(session.last_seen) : '—';
                const isRevoking = revokingId === session.family_id;

                return (
                  <div
                    key={session.id}
                    className="flex items-center gap-4 px-6 py-4"
                  >
                    {/* Device icon */}
                    <div className={`
                      w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-lg
                      ${isFirst ? 'bg-accent/15' : 'bg-surface-subtle'}
                    `}>
                      {/iPhone|iPad|Android/i.test(session.user_agent ?? '') ? '📱' : '💻'}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-ink-primary truncate">
                          {device}
                        </span>
                        {isFirst && (
                          <span className="rounded-full bg-success/15 text-success text-xs font-semibold px-2 py-0.5 shrink-0">
                            This session
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-xs text-ink-muted font-mono">{ip}</span>
                        <span className="text-xs text-ink-muted">Created {created}</span>
                        <span className="text-xs text-ink-muted">Last seen {lastSeen}</span>
                      </div>
                    </div>

                    {/* Revoke */}
                    {!isFirst && (
                      <button
                        id={`revoke-session-${session.family_id}`}
                        type="button"
                        disabled={isRevoking}
                        onClick={() => revokeSession(session.family_id)}
                        className="
                          shrink-0 text-xs font-medium px-3 py-1.5 rounded-md
                          border border-danger/40 text-danger
                          hover:bg-danger/10 transition-colors
                          disabled:opacity-50 disabled:cursor-not-allowed
                        "
                      >
                        {isRevoking ? 'Revoking…' : 'Revoke'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* ── Pending Approvals ── */}
        <SectionCard id="approvals" title="Pending Approvals" badge={pendingCount}>
          {approvals.status === 'loading' && <SectionSkeleton rows={2} />}
          {approvals.status === 'error' && (
            <ErrorState message={approvals.message} onRetry={loadApprovals} />
          )}
          {approvals.status === 'ok' && approvals.data.length === 0 && (
            <EmptyState
              icon="✅"
              title="No pending approvals"
              subtitle="Approval requests requiring your vote will appear here"
            />
          )}
          {approvals.status === 'ok' && approvals.data.length > 0 && (
            <div className="divide-y divide-border">
              {approvals.data.map((req) => {
                const isVoting = votingId === req.id;
                const payload =
                  typeof req.action_payload === 'object' && req.action_payload !== null
                    ? JSON.stringify(req.action_payload, null, 2)
                    : String(req.action_payload);

                return (
                  <div key={req.id} className="px-6 py-5 space-y-3">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-ink-primary font-mono">
                            {req.id.slice(0, 8)}…
                          </span>
                          {req.escalated && (
                            <span className="rounded px-1.5 py-0.5 text-xs font-semibold bg-warning/15 text-warning">
                              Escalated
                            </span>
                          )}
                          {req.break_glass && (
                            <span className="rounded px-1.5 py-0.5 text-xs font-semibold bg-danger/15 text-danger">
                              Break-glass
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-ink-muted mt-0.5">
                          Requested {relativeTime(req.created_at)} · Requester{' '}
                          <span className="font-mono">{req.requester_id.slice(0, 8)}…</span>
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          id={`approve-${req.id}`}
                          type="button"
                          disabled={isVoting}
                          onClick={() => submitVote(req.id, 'approve')}
                          className="
                            text-xs font-semibold px-3.5 py-1.5 rounded-md
                            bg-success/15 text-success border border-success/30
                            hover:bg-success/25 transition-colors
                            disabled:opacity-50 disabled:cursor-not-allowed
                          "
                        >
                          {isVoting ? '…' : 'Approve'}
                        </button>
                        <button
                          id={`deny-${req.id}`}
                          type="button"
                          disabled={isVoting}
                          onClick={() => submitVote(req.id, 'deny')}
                          className="
                            text-xs font-semibold px-3.5 py-1.5 rounded-md
                            bg-danger/15 text-danger border border-danger/30
                            hover:bg-danger/25 transition-colors
                            disabled:opacity-50 disabled:cursor-not-allowed
                          "
                        >
                          {isVoting ? '…' : 'Deny'}
                        </button>
                      </div>
                    </div>

                    {/* Action payload preview */}
                    <details className="text-xs">
                      <summary className="cursor-pointer text-ink-muted hover:text-ink-secondary select-none">
                        View action payload
                      </summary>
                      <pre className="mt-2 rounded bg-surface-subtle border border-border px-3 py-2 overflow-x-auto whitespace-pre-wrap text-ink-secondary text-xs font-mono">
                        {payload}
                      </pre>
                    </details>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* ── Recent Activity ── */}
        <SectionCard id="activity" title="Recent Activity">
          {activity.status === 'loading' && <SectionSkeleton rows={4} />}
          {activity.status === 'error' && (
            <ErrorState message={activity.message} onRetry={loadActivity} />
          )}
          {activity.status === 'ok' && activity.data.length === 0 && (
            <EmptyState
              icon="📋"
              title="No recent activity"
              subtitle="Audit log entries will appear here after you take actions"
            />
          )}
          {activity.status === 'ok' && activity.data.length > 0 && (
            <div className="divide-y divide-border">
              {activity.data.map((entry) => (
                <div key={entry.id} className="flex items-center gap-4 px-6 py-4">
                  {/* Icon */}
                  <div className="w-9 h-9 rounded-full bg-surface-subtle flex items-center justify-center shrink-0 text-base">
                    {auditIcon(entry.entry_type)}
                  </div>

                  {/* Label + time */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-primary">
                      {auditLabel(entry.entry_type)}
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {relativeTime(entry.created_at)}
                    </p>
                  </div>

                  {/* Entry type badge */}
                  <span className="shrink-0 rounded bg-accent/10 text-accent text-xs font-semibold px-2 py-0.5 font-mono">
                    {entry.entry_type}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

      </main>
    </div>
  );
}
