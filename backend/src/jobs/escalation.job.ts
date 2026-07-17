/**
 * M5.6 — Escalation job
 * Runs every 30 seconds (registered via setInterval in index.ts).
 * Finds pending approval_requests that have been waiting longer than their
 * policy's escalation_timeout_seconds and marks them escalated = true.
 *
 * Idempotent: only updates rows where escalated = false, so repeated
 * executions produce no duplicate escalations.
 */
import pool from '../db/pool';
import logger from '../lib/logger';

// ── runEscalationCheck ────────────────────────────────────────────────────
export async function runEscalationCheck(): Promise<void> {
  try {
    const result = await pool.query<{ id: string }>(
      `UPDATE approval_requests ar
       SET escalated = true
       FROM approval_policies ap
       WHERE ar.policy_id = ap.id
         AND ar.status     = 'pending'
         AND ar.escalated  = false
         AND ap.escalation_timeout_seconds IS NOT NULL
         AND ar.created_at + (ap.escalation_timeout_seconds * INTERVAL '1 second') < now()
       RETURNING ar.id`
    );

    if (result.rowCount && result.rowCount > 0) {
      logger.info(
        { escalatedIds: result.rows.map((r) => r.id), count: result.rowCount },
        'escalation job: requests escalated'
      );
    } else {
      logger.debug('escalation job: no requests to escalate');
    }
  } catch (err) {
    // Log but do not crash the server — the job will retry on the next tick
    logger.error({ err }, 'escalation job: check failed');
  }
}
