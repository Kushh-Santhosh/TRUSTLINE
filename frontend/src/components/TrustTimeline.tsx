/**
 * TrustTimeline — reusable vertical session-trust timeline
 *
 * Renders a list of TimelineEvent objects as an annotated vertical
 * timeline. Currently uses mock data. To connect to a backend, pass
 * real events via the `events` prop; the mock data will be ignored.
 *
 * Usage:
 *   <TrustTimeline />                     — renders built-in mock data
 *   <TrustTimeline events={liveEvents} /> — renders supplied events
 */

import { useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────

export type EventStatus = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface TimelineEvent {
  /** Unique key — used as React key */
  id: string;
  /** Displayed time string, e.g. "09:30" or "09:31:04" */
  timestamp: string;
  /** Short event title */
  title: string;
  /** One-line explanatory description */
  description: string;
  /** Drives icon, badge colour, and connector colour */
  status: EventStatus;
  /** Label shown in the badge, e.g. "Verified", "Risk Detected" */
  badge: string;
  /** Icon key — maps to a built-in SVG */
  icon: EventIconKey;
}

type EventIconKey =
  | 'passkey'
  | 'device'
  | 'location'
  | 'score'
  | 'approval'
  | 'alert'
  | 'refresh'
  | 'stepup'
  | 'granted'
  | 'receipt'
  | 'blocked'
  | 'login';

// ── Mock data ─────────────────────────────────────────────────────────────

const MOCK_EVENTS: TimelineEvent[] = [
  {
    id: 'ev-01',
    timestamp: '09:30:00',
    title: 'Login with Passkey',
    description: 'User authenticated using a FIDO2 passkey bound to this device.',
    status: 'success',
    badge: 'Authenticated',
    icon: 'passkey',
  },
  {
    id: 'ev-02',
    timestamp: '09:30:01',
    title: 'Known Device',
    description: 'Device fingerprint matched a previously registered device.',
    status: 'success',
    badge: 'Verified',
    icon: 'device',
  },
  {
    id: 'ev-03',
    timestamp: '09:30:01',
    title: 'Normal Location',
    description: 'IP geolocation is consistent with historical access patterns.',
    status: 'success',
    badge: 'Clear',
    icon: 'location',
  },
  {
    id: 'ev-04',
    timestamp: '09:30:02',
    title: 'Trust Score 96',
    description: 'Initial contextual evaluation returned a high trust score.',
    status: 'info',
    badge: 'Score: 96',
    icon: 'score',
  },
  {
    id: 'ev-05',
    timestamp: '09:31:14',
    title: 'Approval Request Created',
    description: 'User initiated a new multi-party approval request.',
    status: 'info',
    badge: 'Created',
    icon: 'approval',
  },
  {
    id: 'ev-06',
    timestamp: '09:31:15',
    title: 'High Value Transaction Detected',
    description: 'Transaction amount exceeds policy threshold — risk signal raised.',
    status: 'warning',
    badge: 'Risk Signal',
    icon: 'alert',
  },
  {
    id: 'ev-07',
    timestamp: '09:31:16',
    title: 'Trust Re-evaluated',
    description: 'Engine re-scored context after high-value signal. Score dropped to 54.',
    status: 'warning',
    badge: 'Score: 54',
    icon: 'refresh',
  },
  {
    id: 'ev-08',
    timestamp: '09:31:16',
    title: 'Additional Verification Required',
    description: 'Step-up authentication challenge issued. User must re-verify identity.',
    status: 'warning',
    badge: 'Step-up Issued',
    icon: 'stepup',
  },
  {
    id: 'ev-09',
    timestamp: '09:32:08',
    title: 'Approval Granted',
    description: 'Quorum reached. All required approvers voted to approve the request.',
    status: 'success',
    badge: 'Approved',
    icon: 'granted',
  },
  {
    id: 'ev-10',
    timestamp: '09:32:09',
    title: 'Cryptographic Receipt Generated',
    description: 'Ed25519-signed receipt appended to tamper-evident audit chain.',
    status: 'info',
    badge: 'Receipt Issued',
    icon: 'receipt',
  },
];

// ── Design token helpers ──────────────────────────────────────────────────

interface StatusTokens {
  /** Tailwind classes for the icon wrapper */
  iconWrap: string;
  /** Tailwind classes for the icon SVG */
  iconColor: string;
  /** Tailwind classes for the badge pill */
  badgePill: string;
  /** Hex or rgba for the SVG connector line */
  connectorColor: string;
  /** Tailwind classes for the timeline dot */
  dot: string;
}

function statusTokens(s: EventStatus): StatusTokens {
  switch (s) {
    case 'success':
      return {
        iconWrap:       'bg-success-muted border border-success-border',
        iconColor:      'text-success',
        badgePill:      'bg-success-muted text-success border border-success-border',
        connectorColor: 'rgba(22,163,74,.25)',
        dot:            'bg-success',
      };
    case 'warning':
      return {
        iconWrap:       'bg-warning-muted border border-warning-border',
        iconColor:      'text-warning',
        badgePill:      'bg-warning-muted text-warning border border-warning-border',
        connectorColor: 'rgba(217,119,6,.25)',
        dot:            'bg-warning',
      };
    case 'danger':
      return {
        iconWrap:       'bg-danger-muted border border-danger-border',
        iconColor:      'text-danger',
        badgePill:      'bg-danger-muted text-danger border border-danger-border',
        connectorColor: 'rgba(220,38,38,.25)',
        dot:            'bg-danger',
      };
    case 'info':
      return {
        iconWrap:       'bg-accent-muted border border-accent-border',
        iconColor:      'text-accent',
        badgePill:      'bg-accent-muted text-accent border border-accent-border',
        connectorColor: 'rgba(37,99,235,.20)',
        dot:            'bg-accent',
      };
    case 'neutral':
    default:
      return {
        iconWrap:       'bg-surface-subtle border border-border',
        iconColor:      'text-ink-muted',
        badgePill:      'bg-surface-subtle text-ink-secondary border border-border',
        connectorColor: 'rgba(15,23,42,.10)',
        dot:            'bg-ink-muted',
      };
  }
}

// ── Icon registry ─────────────────────────────────────────────────────────

function EventIcon({ type, className }: { type: EventIconKey; className?: string }) {
  const cls = className ?? 'w-4 h-4';
  switch (type) {
    case 'passkey':
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="6" cy="6.5" r="2.5" />
          <path d="M8.5 6.5H14M12 4.5v4" strokeLinecap="round" />
          <path d="M3.5 9L2 13" strokeLinecap="round" />
        </svg>
      );
    case 'device':
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1" y="2.5" width="14" height="9" rx="1.5" />
          <path d="M5 13.5h6M8 11.5v2" strokeLinecap="round" />
        </svg>
      );
    case 'location':
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6c0 3.5 4.5 8.5 4.5 8.5S12.5 9.5 12.5 6c0-2.5-2-4.5-4.5-4.5z" />
          <circle cx="8" cy="6" r="1.5" />
        </svg>
      );
    case 'score':
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="5.5" />
          <path d="M8 5v3.5l2 1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'approval':
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2.5" y="2" width="11" height="12" rx="1.5" />
          <path d="M5 6.5h6M5 9h4" strokeLinecap="round" />
        </svg>
      );
    case 'alert':
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 2.5L1.5 13h13L8 2.5z" strokeLinejoin="round" />
          <path d="M8 6.5v3M8 11h.01" strokeLinecap="round" />
        </svg>
      );
    case 'refresh':
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2.5 8A5.5 5.5 0 0113 5.5" strokeLinecap="round" />
          <path d="M13.5 8A5.5 5.5 0 013 10.5" strokeLinecap="round" />
          <path d="M11 3.5l2 2-2 2M5 10.5l-2 2 2 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'stepup':
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="7" width="10" height="7.5" rx="1.5" />
          <path d="M5.5 7V5a2.5 2.5 0 015 0v2" strokeLinecap="round" />
          <circle cx="8" cy="10.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'granted':
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="5.5" />
          <path d="M5.5 8l1.7 1.7L10.8 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'receipt':
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 1.5v13l2-1.5 2 1.5 2-1.5 2 1.5 2-1.5V1.5L13 3l-2-1.5L9 3 7 1.5 5 3 3 1.5z" strokeLinejoin="round" />
          <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" strokeLinecap="round" />
        </svg>
      );
    case 'blocked':
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="5.5" />
          <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" strokeLinecap="round" />
        </svg>
      );
    case 'login':
    default:
      return (
        <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

// ── Single timeline event row ─────────────────────────────────────────────

function TimelineRow({
  event,
  isLast,
  index,
}: {
  event: TimelineEvent;
  isLast: boolean;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const tok = statusTokens(event.status);

  // Staggered entrance delay (capped at 400 ms for UX comfort)
  const delay = Math.min(index * 60, 400);

  return (
    <div
      className="group flex gap-4 items-start"
      style={{
        animationDelay: `${delay}ms`,
        animationFillMode: 'both',
      }}
    >
      {/* ── Left column: dot + connector ── */}
      <div className="flex flex-col items-center shrink-0" style={{ width: 36 }}>
        {/* Icon circle */}
        <div
          className={`
            flex h-9 w-9 shrink-0 items-center justify-center rounded-full
            transition-transform duration-200 group-hover:scale-105
            ${tok.iconWrap} ${tok.iconColor}
          `}
          aria-hidden="true"
        >
          <EventIcon type={event.icon} />
        </div>

        {/* Vertical connector */}
        {!isLast && (
          <div
            className="w-px flex-1 mt-1"
            style={{
              minHeight: 40,
              background: `linear-gradient(to bottom, ${tok.connectorColor}, rgba(15,23,42,.04) 100%)`,
            }}
          />
        )}
      </div>

      {/* ── Right column: content card ── */}
      <div className={`flex-1 min-w-0 ${isLast ? 'pb-0' : 'pb-6'}`}>
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="
            w-full text-left rounded-xl border border-border bg-surface-elevated
            px-4 py-3.5 shadow-xs
            hover:shadow-sm hover:border-border-strong hover:-translate-y-px
            transition-all duration-200
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40
          "
          aria-expanded={expanded}
          id={`timeline-event-${event.id}`}
        >
          <div className="flex items-start gap-3">
            {/* Timestamp + title block */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                {/* Timestamp */}
                <span className="font-mono text-2xs text-ink-muted shrink-0 tabular-nums">
                  {event.timestamp}
                </span>
                {/* Status dot */}
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${tok.dot}`} aria-hidden="true" />
                {/* Title */}
                <span className="text-sm font-semibold text-ink-primary truncate">
                  {event.title}
                </span>
              </div>
              {/* Description — always visible */}
              <p className="text-xs leading-5 text-ink-muted">
                {event.description}
              </p>
            </div>

            {/* Badge */}
            <span
              className={`
                shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5
                text-2xs font-semibold whitespace-nowrap
                ${tok.badgePill}
              `}
            >
              {event.badge}
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}

// ── Status filter pill ────────────────────────────────────────────────────

const STATUS_FILTERS: { label: string; value: EventStatus | 'all' }[] = [
  { label: 'All',     value: 'all' },
  { label: 'Success', value: 'success' },
  { label: 'Warning', value: 'warning' },
  { label: 'Info',    value: 'info' },
  { label: 'Danger',  value: 'danger' },
];

function FilterPills({
  active,
  onChange,
  counts,
}: {
  active: EventStatus | 'all';
  onChange: (v: EventStatus | 'all') => void;
  counts: Record<string, number>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter events by status">
      {STATUS_FILTERS.map((f) => {
        const count = f.value === 'all' ? undefined : counts[f.value];
        const isActive = active === f.value;
        return (
          <button
            key={f.value}
            type="button"
            id={`timeline-filter-${f.value}`}
            onClick={() => onChange(f.value)}
            className={`
              inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium
              transition-all duration-150
              ${isActive
                ? 'bg-ink-primary border-ink-primary text-ink-inverted shadow-sm'
                : 'bg-surface-elevated border-border text-ink-muted hover:text-ink-primary hover:border-border-strong'}
            `}
          >
            {f.label}
            {count !== undefined && count > 0 && (
              <span className={`rounded-full px-1.5 py-px text-2xs font-semibold tabular-nums leading-none
                ${isActive ? 'bg-white/20 text-white' : 'bg-surface-subtle text-ink-muted'}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────

interface TrustTimelineProps {
  /**
   * Optional live event array from an API.
   * When omitted, built-in mock data is rendered.
   */
  events?: TimelineEvent[];
  /** Optional Tailwind classes for the outer section wrapper */
  className?: string;
}

export default function TrustTimeline({ events, className = '' }: TrustTimelineProps) {
  const source = events ?? MOCK_EVENTS;
  const [filter, setFilter] = useState<EventStatus | 'all'>('all');

  // Status counts for filter badges
  const counts = source.reduce<Record<string, number>>((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1;
    return acc;
  }, {});

  const visible = filter === 'all' ? source : source.filter((e) => e.status === filter);

  return (
    <section aria-labelledby="trust-timeline-heading" className={className}>

      {/* ── Section header ── */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-muted border border-accent-border">
            <svg className="w-3.5 h-3.5 text-accent" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 8h2M4 4h2M6 12h2M8 2h2M10 6h2M12 10h2" strokeLinecap="round" />
              <path d="M2 8l2-4 2 8 2-10 2 4 2 4 2-2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h2 id="trust-timeline-heading" className="text-sm font-semibold text-ink-primary leading-none mb-0.5">
              Trust Timeline
            </h2>
            <p className="text-xs text-ink-muted leading-none">Session trust evaluation — event by event</p>
          </div>
          {!events && (
            <span className="rounded-full bg-accent-muted border border-accent-border px-2 py-0.5 text-2xs font-semibold text-accent">
              Demo
            </span>
          )}
        </div>

        {/* Event counter */}
        <span className="text-xs text-ink-muted tabular-nums">
          {visible.length} of {source.length} events
        </span>
      </div>

      {/* ── Card wrapper ── */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-xs">

        {/* ── Card header: filters + legend ── */}
        <div className="px-5 py-4 border-b border-border bg-surface-subtle/60 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <FilterPills active={filter} onChange={setFilter} counts={counts} />

            {/* Legend */}
            <div className="flex items-center gap-4">
              {(
                [
                  { label: 'Success', dot: 'bg-success' },
                  { label: 'Warning', dot: 'bg-warning' },
                  { label: 'Info',    dot: 'bg-accent' },
                  { label: 'Danger',  dot: 'bg-danger' },
                ] as const
              ).map((l) => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${l.dot}`} aria-hidden="true" />
                  <span className="text-2xs text-ink-muted font-medium">{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Timeline body ── */}
        <div className="px-5 py-6 sm:px-6">
          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-subtle text-ink-muted">
                <svg className="w-5 h-5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="8" cy="8" r="5.5" />
                  <path d="M5 8h6" strokeLinecap="round" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-ink-primary">No events</p>
                <p className="text-xs text-ink-muted mt-0.5">No events match the selected filter.</p>
              </div>
              <button
                type="button"
                onClick={() => setFilter('all')}
                className="text-xs font-medium text-accent hover:text-accent-hover underline underline-offset-2 transition-colors"
              >
                Show all events
              </button>
            </div>
          ) : (
            <div>
              {visible.map((event, i) => (
                <TimelineRow
                  key={event.id}
                  event={event}
                  isLast={i === visible.length - 1}
                  index={i}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Card footer ── */}
        <div className="px-5 py-4 border-t border-border bg-surface-subtle/40 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-2 w-2 rounded-full bg-success animate-pulse" aria-hidden="true" />
            <p className="text-xs text-ink-muted">
              {events
                ? 'Live session data — updating in real-time'
                : <><span className="font-medium text-ink-secondary">Mock data</span> — backend integration will stream live events here</>
              }
            </p>
            <span className="ml-auto font-mono text-2xs text-ink-muted tabular-nums">
              {source.length} total events
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
