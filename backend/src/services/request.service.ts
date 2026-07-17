/**
 * M5.2 — Approval request service
 * Creates pending approval requests against a policy,
 * snapshotting the policy version at creation time.
 */
import pool from '../db/pool';

// ── Types ─────────────────────────────────────────────────────────────────

export interface RequestRow {
  id: string;
  policy_id: string;
  policy_version_snapshot: number;
  requester_id: string;
  action_payload: unknown;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  created_at: Date;
  resolved_at: Date | null;
}

// ── createRequest ─────────────────────────────────────────────────────────
export async function createRequest(
  policyId: string,
  requesterId: string,
  actionPayload: unknown
): Promise<RequestRow> {
  // 1. Fetch the current policy to snapshot its version
  const { rows: policyRows } = await pool.query<{ version: number }>(
    'SELECT version FROM approval_policies WHERE id = $1',
    [policyId]
  );

  if (!policyRows[0]) {
    throw new Error('policy not found');
  }

  const policyVersionSnapshot = policyRows[0].version;

  // 2. Insert the request with status 'pending' and the snapshotted version
  const { rows } = await pool.query<RequestRow>(
    `INSERT INTO approval_requests
       (policy_id, policy_version_snapshot, requester_id, action_payload, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING *`,
    [policyId, policyVersionSnapshot, requesterId, JSON.stringify(actionPayload)]
  );

  return rows[0];
}
