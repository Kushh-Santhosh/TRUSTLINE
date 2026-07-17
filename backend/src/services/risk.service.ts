/**
 * M7.2 — Risk scoring heuristic
 * M7.4 — Risk decision audit logging
 * M8.2 — In-memory step-up rate limiter for MFA fatigue detection
 *
 * Scoring rules:
 *   high   — no login history at all
 *   medium — IP is new, user-agent matches history
 *   low    — otherwise
 *
 * Rate limiter: >3 step-up attempts within 60 s → blocked (429).
 * Uses an in-memory Map (resets on server restart).
 */
import pool from '../db/pool';
import { appendAuditEntry } from './audit.service';
import logger from '../lib/logger';

// ── M8.2: In-memory step-up rate limiter ──────────────────────────────────

const STEP_UP_WINDOW_MS  = 60_000; // 60 seconds
const STEP_UP_MAX_ATTEMPTS = 3;    // block after more than 3 in the window

/** userId → timestamps of recent step-up attempts */
const stepUpAttempts = new Map<string, number[]>();

/** Record an attempt and return true if the user is now blocked. */
export function recordStepUpAttempt(userId: string): boolean {
  const now  = Date.now();
  const prev = (stepUpAttempts.get(userId) ?? []).filter((t) => now - t < STEP_UP_WINDOW_MS);
  prev.push(now);
  stepUpAttempts.set(userId, prev);
  return prev.length > STEP_UP_MAX_ATTEMPTS;
}

/** Check-only (does not record). Returns true if already blocked. */
export function isStepUpBlocked(userId: string): boolean {
  const now  = Date.now();
  const prev = (stepUpAttempts.get(userId) ?? []).filter((t) => now - t < STEP_UP_WINDOW_MS);
  return prev.length > STEP_UP_MAX_ATTEMPTS;
}

// ── Types ─────────────────────────────────────────────────────────────────

export type RiskScore = 'low' | 'medium' | 'high';

export interface RiskResult {
  score: RiskScore;
  reason: string;   // human-readable trigger description surfaced in audit entry
}

// ── internal helper ───────────────────────────────────────────────────────
// Appends a risk_decision audit entry and returns the result unchanged.
// Always fail-open.
function auditAndReturn(
  result: RiskResult,
  userId: string,
  ip?: string,
  userAgent?: string
): RiskResult {
  appendAuditEntry('risk_decision', {
    userId,
    ip: ip ?? null,
    userAgent: userAgent ?? null,
    score: result.score,
    reason: result.reason,
  }).catch((err) =>
    logger.error({ err, userId }, 'audit: failed to log risk_decision event')
  );
  return result;
}

// ── scoreLoginRisk ────────────────────────────────────────────────────────
export async function scoreLoginRisk(
  userId: string,
  ip?: string,
  userAgent?: string
): Promise<RiskResult> {
  // 1. Fetch last 5 login events — read-only SELECT
  const { rows } = await pool.query<{ ip: string | null; user_agent: string | null }>(
    `SELECT ip, user_agent
     FROM login_events
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 5`,
    [userId]
  );

  // 2. No history at all → high risk (first-ever login)
  if (rows.length === 0) {
    return auditAndReturn({ score: 'high', reason: 'no_history' }, userId, ip, userAgent);
  }

  // 3. Build seen sets from history (filter out nulls)
  const seenIps = new Set(rows.map((r) => r.ip).filter((v): v is string => v !== null));
  const seenUas = new Set(
    rows.map((r) => r.user_agent).filter((v): v is string => v !== null)
  );

  const ipSeen = ip ? seenIps.has(ip) : true;     // missing IP → don't penalise
  const uaSeen = userAgent ? seenUas.has(userAgent) : true; // missing UA → don't penalise

  // 4. IP familiar → low
  if (ipSeen) {
    return auditAndReturn({ score: 'low', reason: 'known_ip' }, userId, ip, userAgent);
  }

  // 5. IP new but user-agent matches history → medium
  if (uaSeen) {
    return auditAndReturn({ score: 'medium', reason: 'new_ip' }, userId, ip, userAgent);
  }

  // 6. Otherwise (IP new + UA new, but history exists) → low per playbook "otherwise"
  return auditAndReturn({ score: 'low', reason: 'known_device_pattern' }, userId, ip, userAgent);
}
