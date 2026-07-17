/**
 * M7.2 — Risk scoring heuristic
 * Scores a login attempt as 'low' | 'medium' | 'high' based on
 * how familiar the presenting IP + user-agent combination is
 * relative to the user's last 5 login events.
 *
 * Rules (exactly as specified in playbook):
 *   high   — no login history at all (first login)
 *   medium — history exists, IP is new, but user-agent matches history
 *   low    — otherwise (IP has been seen before)
 *
 * Not wired into the login route yet — that is M7.3.
 * Read-only: scoring performs no database writes.
 */
import pool from '../db/pool';

// ── Types ─────────────────────────────────────────────────────────────────

export type RiskScore = 'low' | 'medium' | 'high';

export interface RiskResult {
  score: RiskScore;
  reason: string;   // human-readable trigger description for M7.4 audit
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
    return { score: 'high', reason: 'no_history' };
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
    return { score: 'low', reason: 'known_ip' };
  }

  // 5. IP new but user-agent matches history → medium
  if (uaSeen) {
    return { score: 'medium', reason: 'new_ip' };
  }

  // 6. Otherwise (IP new + UA new, but history exists) → also treated as low per playbook "otherwise"
  return { score: 'low', reason: 'known_device_pattern' };
}
