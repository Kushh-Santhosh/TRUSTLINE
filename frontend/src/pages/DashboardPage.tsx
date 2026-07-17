export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-surface-base text-ink-primary">

      {/* Top nav */}
      <header className="border-b border-border bg-surface-subtle px-6 py-4 flex items-center justify-between">
        <span className="text-lg font-heading font-semibold tracking-tight">
          Trust<span className="text-accent">Line</span>
        </span>
        <span className="text-sm text-ink-secondary">Dashboard</span>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-6 py-10 space-y-6">

        {/* Active Sessions */}
        <section aria-labelledby="sessions-heading">
          <h2
            id="sessions-heading"
            className="text-base font-semibold text-ink-primary mb-3"
          >
            Active Sessions
          </h2>
          <div className="rounded-xl border border-border bg-surface-elevated p-8 flex flex-col items-center justify-center text-center min-h-32 shadow">
            <p className="text-sm text-ink-muted">No active sessions</p>
            <p className="text-xs text-ink-muted mt-1 opacity-60">
              Sessions will appear here after sign-in
            </p>
          </div>
        </section>

        {/* Pending Approvals */}
        <section aria-labelledby="approvals-heading">
          <h2
            id="approvals-heading"
            className="text-base font-semibold text-ink-primary mb-3"
          >
            Pending Approvals
          </h2>
          <div className="rounded-xl border border-border bg-surface-elevated p-8 flex flex-col items-center justify-center text-center min-h-32 shadow">
            <p className="text-sm text-ink-muted">No pending approvals</p>
            <p className="text-xs text-ink-muted mt-1 opacity-60">
              Approval requests requiring your signature will appear here
            </p>
          </div>
        </section>

        {/* Recent Activity */}
        <section aria-labelledby="activity-heading">
          <h2
            id="activity-heading"
            className="text-base font-semibold text-ink-primary mb-3"
          >
            Recent Activity
          </h2>
          <div className="rounded-xl border border-border bg-surface-elevated p-8 flex flex-col items-center justify-center text-center min-h-32 shadow">
            <p className="text-sm text-ink-muted">No recent activity</p>
            <p className="text-xs text-ink-muted mt-1 opacity-60">
              Audit log entries will appear here
            </p>
          </div>
        </section>

      </main>
    </div>
  );
}
