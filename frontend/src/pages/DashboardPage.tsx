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

interface PolicyRow {
  id: string;
  name: string;
  quorum_type: string;
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

function auditIcon(entryType: string): React.ReactNode {
  const cls = 'w-4 h-4 shrink-0';
  if (entryType === 'login')
    return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="3" width="12" height="10" rx="2" />
        <path d="M8 6v4M6 8h4" strokeLinecap="round" />
      </svg>
    );
  if (entryType.includes('vote'))
    return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 5h10M3 8h7M3 11h5" strokeLinecap="round" />
      </svg>
    );
  if (entryType.includes('resolved'))
    return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="5.5" />
        <path d="M5.5 8l2 2 3-3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (entryType.includes('register') || entryType.includes('webauthn'))
    return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="4" y="1.5" width="8" height="13" rx="1.5" />
        <circle cx="8" cy="10.5" r="0.75" fill="currentColor" stroke="none" />
      </svg>
    );
  return (
    <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      <path d="M5 8h6M5 5.5h4M5 10.5h3" strokeLinecap="round" />
    </svg>
  );
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

function auditColor(entryType: string): string {
  if (entryType.includes('resolved')) return 'text-success bg-success-muted';
  if (entryType.includes('vote'))     return 'text-accent bg-accent-muted';
  if (entryType.includes('register') || entryType.includes('webauthn')) return 'text-accent bg-accent-muted';
  if (entryType === 'login')          return 'text-ink-secondary bg-surface-subtle';
  return 'text-ink-muted bg-surface-subtle';
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
      className={`animate-pulse rounded-md bg-surface-subtle ${className}`}
      aria-hidden="true"
    />
  );
}

function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-4.5">
          <Skeleton className="h-8 w-8 shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-3/5" />
          </div>
          <Skeleton className="h-6 w-14 rounded-md shrink-0" />
        </div>
      ))}
    </div>
  );
}

// ── EmptyState ─────────────────────────────────────────────────────────────

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-subtle text-ink-muted">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-ink-primary">{title}</p>
        <p className="mt-1 max-w-xs text-xs leading-5 text-ink-muted">{subtitle}</p>
      </div>
    </div>
  );
}

function EmptyIcon({ type }: { type: 'sessions' | 'approvals' | 'activity' }) {
  const cls = 'h-5 w-5';
  if (type === 'sessions') {
    return <DeviceIcon ua={null} />;
  }
  if (type === 'approvals') {
    return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="5.5" />
        <path d="M5.5 8l1.7 1.7L10.8 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="2" width="10" height="12" rx="1.5" />
      <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" strokeLinecap="round" />
    </svg>
  );
}

// ── ErrorState ─────────────────────────────────────────────────────────────

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-danger-muted">
        <svg className="w-4 h-4 text-danger" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="5.5" />
          <path d="M8 5.5v3M8 10.5h.01" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-ink-primary">Failed to load</p>
        <p className="text-xs text-ink-muted mt-0.5">{message}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="text-xs font-medium text-accent hover:text-accent-hover underline underline-offset-2 transition-colors"
      >
        Try again
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
      <div className="mb-3 flex items-center gap-2">
        <h2 id={`${id}-heading`} className="text-sm font-semibold text-ink-primary">
          {title}
        </h2>
        {badge !== undefined && badge > 0 && (
          <span className="rounded-full bg-accent-muted px-1.5 py-0.5 text-2xs font-semibold leading-none tabular-nums text-accent">
            {badge}
          </span>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-xs">
        {children}
      </div>
    </section>
  );
}

// ── StatCard ───────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  loading: boolean;
}) {
  return (
    <div className="min-w-0 flex-1 px-5 py-4 sm:px-6">
      <p className="mb-2 text-2xs font-medium uppercase tracking-wider text-ink-muted">{label}</p>
      {loading ? (
        <>
          <Skeleton className="mb-2 h-7 w-10" />
          <Skeleton className="h-3 w-20" />
        </>
      ) : (
        <>
          <p className="mb-1 text-2xl font-semibold leading-none tracking-tight text-ink-primary tabular-nums">{value}</p>
          {sub && <p className="text-xs text-ink-muted">{sub}</p>}
        </>
      )}
    </div>
  );
}

// ── DeviceIcon ─────────────────────────────────────────────────────────────

function DeviceIcon({ ua }: { ua: string | null }) {
  const isMobile = /iPhone|iPad|Android/i.test(ua ?? '');
  return isMobile ? (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="1.5" width="8" height="13" rx="1.5" />
      <circle cx="8" cy="11.5" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  ) : (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="2.5" width="14" height="9" rx="1.5" />
      <path d="M5 13.5h6M8 11.5v2" strokeLinecap="round" />
    </svg>
  );
}

// ── Approval UI ───────────────────────────────────────────────────────────

function ApprovalStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const styles: Record<string, string> = {
    pending: 'border-warning-border bg-warning-muted text-warning',
    approved: 'border-success-border bg-success-muted text-success',
    denied: 'border-danger-border bg-danger-muted text-danger',
  };
  const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-semibold ${styles[normalized] ?? 'border-border bg-surface-subtle text-ink-secondary'}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}

function ApprovalListSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 2 }).map((_, index) => (
        <div key={index} className="space-y-4 px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-44" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border py-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, itemIndex) => (
              <div key={itemIndex} className="space-y-1.5">
                <Skeleton className="h-2.5 w-12" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
          <div className="flex gap-2"><Skeleton className="h-8 w-20" /><Skeleton className="h-8 w-16" /></div>
        </div>
      ))}
    </div>
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
  const [demoStatus, setDemoStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ type: 'idle' });

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

  // ── Demo: Create Approval Request ────────────────────────────────────
  // 1. Find or create a demo policy (single_senior quorum — one vote resolves).
  // 2. Create a demo approval request.
  // 3. Refresh Pending Approvals so the new request is instantly visible.
  async function createDemoRequest() {
    if (!token || demoStatus.type === 'loading') return;
    setDemoStatus({ type: 'loading' });
    try {
      // Step 1: find an existing demo policy
      const policies = await authedGet<PolicyRow[]>('/api/approval/policies', token);
      let policyId: string;
      const existing = policies.find((p) => p.name === 'TrustLine Demo Policy');
      if (existing) {
        policyId = existing.id;
      } else {
        // Create a policy with single_senior quorum — one approve/deny vote resolves immediately
        const created = await authedPost<PolicyRow>('/api/approval/policies', token, {
          name: 'TrustLine Demo Policy',
          quorum_type: 'single_senior',
          eligible_roles: ['demo_approver'],
        });
        policyId = created.id;
      }

      // Step 2: create a demo request with a descriptive payload
      await authedPost('/api/approval/requests', token, {
        policyId,
        actionPayload: {
          action: 'demo_transfer',
          amount: '1000.00',
          currency: 'USD',
          description: 'Demo: high-value transfer requiring approval',
          createdAt: new Date().toISOString(),
        },
      });

      setDemoStatus({ type: 'success', message: 'Demo request created — approve or deny it in Pending Approvals.' });
      // Step 3: reload Pending Approvals
      void loadApprovals();
    } catch (err) {
      setDemoStatus({ type: 'error', message: apiErrorMsg(err) });
    }
  }

  // ── Sign out ────────────────────────────────────────────────────────────

  function handleSignOut() {
    clearTokens();
    navigate('/login');
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const pendingCount  = approvals.status === 'ok' ? approvals.data.length : undefined;
  const sessionCount  = sessions.status === 'ok'  ? sessions.data.length  : undefined;
  const activityCount = activity.status === 'ok'  ? activity.data.length  : undefined;

  return (
    <div className="min-h-screen bg-surface-base text-ink-primary">

      {/* ── Sticky top nav ── */}
      <header className="sticky top-0 z-20 border-b border-border bg-surface-elevated/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-tight">
              Trust<span className="text-accent">Line</span>
            </span>
            <span className="text-border-strong select-none text-sm">/</span>
            <span className="text-sm text-ink-secondary">Dashboard</span>
          </div>
          <button
            id="sign-out-btn"
            type="button"
            onClick={handleSignOut}
            className="
              text-xs font-medium px-3 py-1.5 rounded-md border border-border
              text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary
              transition-colors duration-150
            "
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">

        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-ink-primary">Overview</h1>
          <p className="text-sm text-ink-secondary">Monitor your account activity and respond to requests that need your attention.</p>
        </div>

        <section aria-label="Account overview" className="overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-xs">
          <div className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <StatCard
              label="Active sessions"
              value={sessionCount ?? '—'}
              sub={sessionCount === 1 ? 'device connected' : 'devices connected'}
              loading={sessions.status === 'loading'}
            />
            <StatCard
              label="Pending approvals"
              value={pendingCount ?? '—'}
              sub={pendingCount === 1 ? 'request needs review' : 'requests need review'}
              loading={approvals.status === 'loading'}
            />
            <StatCard
              label="Recent activity"
              value={activityCount ?? '—'}
              sub="audit entries available"
              loading={activity.status === 'loading'}
            />
          </div>
        </section>

        {/* ── Active Sessions ── */}
        <SectionCard id="sessions" title="Active Sessions">
          {sessions.status === 'loading' && <SectionSkeleton rows={2} />}
          {sessions.status === 'error' && (
            <ErrorState message={sessions.message} onRetry={loadSessions} />
          )}
          {sessions.status === 'ok' && sessions.data.length === 0 && (
            <EmptyState
              icon={<EmptyIcon type="sessions" />}
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
                    className="flex items-center gap-3 px-5 py-4 sm:px-6"
                  >
                    {/* Device icon */}
                    <div className={`
                      flex h-9 w-9 shrink-0 items-center justify-center rounded-lg
                      ${isFirst ? 'bg-accent-muted text-accent' : 'bg-surface-subtle text-ink-secondary'}
                    `}>
                      <DeviceIcon ua={session.user_agent} />
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-ink-primary truncate">
                          {device}
                        </span>
                        {isFirst && (
                          <span className="shrink-0 rounded-full bg-success-muted px-2 py-0.5 text-2xs font-semibold text-success">
                            This session
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
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
                          border border-danger-border bg-surface-elevated text-danger
                          hover:bg-danger-muted transition-colors
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

        <div className="grid items-start gap-8 lg:grid-cols-2">
        {/* ── Pending Approvals ── */}
        <SectionCard id="approvals" title="Pending Approvals" badge={pendingCount}>
          {approvals.status === 'loading' && <ApprovalListSkeleton />}
          {approvals.status === 'error' && (
            <ErrorState message={approvals.message} onRetry={loadApprovals} />
          )}
          {approvals.status === 'ok' && approvals.data.length === 0 && (
            <EmptyState
              icon={<EmptyIcon type="approvals" />}
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
                  <article key={req.id} className="space-y-4 px-5 py-5 sm:px-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-medium text-ink-primary">
                            {req.id.slice(0, 8)}…
                          </span>
                          <ApprovalStatusBadge status={req.status} />
                          {req.escalated && (
                            <span className="rounded bg-warning-muted px-1.5 py-0.5 text-2xs font-semibold text-warning">
                              Escalated
                            </span>
                          )}
                          {req.break_glass && (
                            <span className="rounded bg-danger-muted px-1.5 py-0.5 text-2xs font-semibold text-danger">
                              Break-glass
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-ink-secondary">Approval request awaiting your decision</p>
                      </div>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border py-3 text-xs sm:grid-cols-4">
                      <div>
                        <dt className="text-2xs font-medium uppercase tracking-wider text-ink-muted">Requested</dt>
                        <dd className="mt-1 font-medium text-ink-secondary">{relativeTime(req.created_at)}</dd>
                      </div>
                      <div>
                        <dt className="text-2xs font-medium uppercase tracking-wider text-ink-muted">Requester</dt>
                        <dd className="mt-1 truncate font-mono text-ink-secondary" title={req.requester_id}>{req.requester_id.slice(0, 8)}…</dd>
                      </div>
                      <div>
                        <dt className="text-2xs font-medium uppercase tracking-wider text-ink-muted">Policy</dt>
                        <dd className="mt-1 truncate font-mono text-ink-secondary" title={req.policy_id}>{req.policy_id.slice(0, 8)}…</dd>
                      </div>
                      <div>
                        <dt className="text-2xs font-medium uppercase tracking-wider text-ink-muted">Quorum</dt>
                        <dd className="mt-1 font-medium text-ink-secondary">Awaiting votes</dd>
                      </div>
                    </dl>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <details className="text-xs">
                        <summary className="cursor-pointer select-none font-medium text-ink-secondary hover:text-ink-primary">
                          View request details
                        </summary>
                        <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface-subtle px-3 py-2.5 text-xs font-mono leading-5 text-ink-secondary">
                          {payload}
                        </pre>
                      </details>
                      <div className="flex shrink-0 gap-2">
                        <button
                          id={`approve-${req.id}`}
                          type="button"
                          disabled={isVoting}
                          onClick={() => submitVote(req.id, 'approve')}
                          className="
                            rounded-md bg-success px-3 py-1.5 text-xs font-semibold text-ink-inverted
                            hover:opacity-90 transition-colors focus-visible:ring-2 focus-visible:ring-success/30
                            disabled:opacity-50 disabled:cursor-not-allowed
                          "
                        >
                          {isVoting ? 'Submitting…' : 'Approve'}
                        </button>
                        <button
                          id={`deny-${req.id}`}
                          type="button"
                          disabled={isVoting}
                          onClick={() => submitVote(req.id, 'deny')}
                          className="
                            rounded-md border border-border bg-surface-elevated px-3 py-1.5
                            text-xs font-semibold text-danger hover:border-danger-border hover:bg-danger-muted transition-colors
                            disabled:opacity-50 disabled:cursor-not-allowed
                          "
                        >
                          {isVoting ? 'Submitting…' : 'Deny'}
                        </button>
                      </div>
                    </div>
                  </article>
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
              icon={<EmptyIcon type="activity" />}
              title="No recent activity"
              subtitle="Audit log entries will appear here after you take actions"
            />
          )}
          {activity.status === 'ok' && activity.data.length > 0 && (
            <div className="divide-y divide-border">
              {activity.data.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 px-5 py-4 sm:px-6">
                  {/* Icon */}
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${auditColor(entry.entry_type)}`}>
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
                  <span className="shrink-0 rounded bg-surface-subtle px-2 py-0.5 text-2xs font-medium font-mono text-ink-secondary">
                    {entry.entry_type}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
        </div>

        {/* ── Demo: Create Approval Request ── */}
        <section aria-labelledby="demo-heading">
          <div className="mb-3 flex items-center gap-2">
            <h2 id="demo-heading" className="text-sm font-semibold text-ink-primary">
              Demo: Approval Workflow
            </h2>
            <span className="rounded-full bg-accent-muted px-2 py-0.5 text-2xs font-semibold text-accent">
              Try it
            </span>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-xs">
            <div className="space-y-4 px-5 py-5 sm:px-6">
              <p className="text-sm text-ink-secondary">
                Create a demo approval request to try the full workflow:{' '}
                <strong className="text-ink-primary">create → approve/deny → view receipt</strong>.
                After voting, the resolved request will appear in{' '}
                <a href="/demo/dispute" className="text-accent underline underline-offset-2 hover:text-accent-hover">
                  Dispute Resolution
                </a>{' '}
                with its cryptographic evidence.
              </p>

              {demoStatus.type === 'error' && (
                <div role="alert" className="rounded-md border border-danger-border bg-danger-muted px-4 py-3 text-sm text-danger">
                  {demoStatus.message}
                </div>
              )}
              {demoStatus.type === 'success' && (
                <div role="status" className="rounded-md border border-success-border bg-success-muted px-4 py-3 text-sm text-success">
                  {demoStatus.message}
                </div>
              )}

              <div className="flex flex-wrap gap-3 items-center">
                <button
                  id="create-demo-request-btn"
                  type="button"
                  disabled={demoStatus.type === 'loading'}
                  onClick={createDemoRequest}
                  className="
                    rounded-md bg-accent px-4 py-2 text-sm font-semibold text-ink-inverted hover:bg-accent-hover
                    transition-colors shadow-accent disabled:opacity-60 disabled:cursor-not-allowed
                  "
                >
                  {demoStatus.type === 'loading' ? 'Creating…' : '＋ Create demo request'}
                </button>
                <a
                  href="/demo/dispute"
                  className="text-sm font-medium text-accent hover:text-accent-hover underline underline-offset-2 transition-colors"
                >
                  View Dispute Resolution →
                </a>
              </div>

              <p className="text-xs text-ink-muted">
                The demo policy uses <code className="font-mono bg-surface-subtle px-1 rounded">single_senior</code> quorum — one vote resolves the request immediately.
                Every vote is signed with Ed25519 and recorded in the tamper-evident audit chain.
              </p>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
