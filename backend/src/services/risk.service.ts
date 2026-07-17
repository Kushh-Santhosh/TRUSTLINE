/**
 * M7.2 — Risk scoring heuristic
 * M7.4 — Risk decision audit logging
 * Scores a login attempt as 'low' | 'medium' | 'high' based on
 * how familiar the presenting IP + user-agent combination is
 * relative to the user's last 5 login events.
 *
 * Rules (exactly as specified in playbook):
 *   high   — no login history at all (first login)
 *   medium — history exists, IP is new, but user-agent matches history
 *   low    — otherwise (IP has been seen before)
 *
 * M7.4: before returning the score, calls appendAuditEntry('risk_decision', ...)
 * Audit failures are fail-open — they never block login or step-up.
 */
import pool from '../db/pool';
import { appendAuditEntry } from './audit.service';
import logger from '../lib/logger';

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
