// Temporary approver-to-approver delegation management with hard expiry.
import pool from '../db/pool';

// ── Types ─────────────────────────────────────────────────────────────────

export interface DelegationRow {
  id: string;
  delegator_id: string;
  delegate_id: string;
  expires_at: Date;
  created_at: Date;
}

// ── createDelegation ──────────────────────────────────────────────────────
export async function createDelegation(
  delegatorId: string,
  delegateId: string,
  expiresAt: Date
): Promise<DelegationRow> {
  if (delegatorId === delegateId) {
    throw new Error('delegator and delegate must be different users');
  }
  if (expiresAt <= new Date()) {
    throw new Error('expires_at must be in the future');
  }

  const { rows } = await pool.query<DelegationRow>(
    `INSERT INTO delegations (delegator_id, delegate_id, expires_at)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [delegatorId, delegateId, expiresAt]
  );

  return rows[0];
}

// ── isActiveDelegate ──────────────────────────────────────────────────────
// Returns true if the user has at least one non-expired delegation
// where they are the delegate.
export async function isActiveDelegate(userId: string): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM delegations
       WHERE delegate_id = $1
         AND expires_at > now()
     ) AS exists`,
    [userId]
  );
  return rows[0].exists;
}

// ── hasAnyDelegation ──────────────────────────────────────────────────────
// Returns true if the user appears as a delegate in ANY delegation row
// (expired or not). Used to distinguish "direct approver" from "delegate".
export async function hasAnyDelegation(userId: string): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM delegations
       WHERE delegate_id = $1
     ) AS exists`,
    [userId]
  );
  return rows[0].exists;
}
