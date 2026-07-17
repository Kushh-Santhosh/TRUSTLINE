/**
 * M5.2 — Approval request service
 * M5.4 — Vote submission with quorum evaluation
 * M5.5 — Delegation expiry check integrated into vote eligibility
 * M5.7 — Break-glass emergency access
 * Creates pending approval requests against a policy,
 * snapshotting the policy version at creation time.
 * Handles vote insertion, status transitions, and emergency overrides.
 */
import pool from '../db/pool';
import { evaluateQuorum, type QuorumPolicy, type Vote } from './quorum.service';
import { hasAnyDelegation, isActiveDelegate } from './delegation.service';

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
  // M5.6
  escalated: boolean;
  // M5.7
  break_glass: boolean;
  needs_review: boolean;
}

export interface VoteRow {
  id: string;
  request_id: string;
  approver_id: string;
  decision: 'approve' | 'deny';
  signature: string;
  created_at: Date;
}

export interface SubmitVoteResult {
  vote: VoteRow;
  request: RequestRow;
  quorumResult: 'approved' | 'denied' | 'pending';
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

// ── submitVote ────────────────────────────────────────────────────────────
export async function submitVote(
  requestId: string,
  approverId: string,
  decision: 'approve' | 'deny',
  signature: string
): Promise<SubmitVoteResult> {
  // 1. Fetch the request — must exist and be pending
  const { rows: requestRows } = await pool.query<RequestRow>(
    'SELECT * FROM approval_requests WHERE id = $1',
    [requestId]
  );

  if (!requestRows[0]) {
    throw new Error('request not found');
  }

  const currentRequest = requestRows[0];

  if (currentRequest.status !== 'pending') {
    throw new Error(`request is already ${currentRequest.status}`);
  }

  // 2-a. Delegation expiry check:
  //   If the voter appears as a delegate in any delegation record,
  //   they must have at least one active (non-expired) delegation.
  //   Direct approvers (no delegation records) pass through unchanged.
  const isDelegate = await hasAnyDelegation(approverId);
  if (isDelegate) {
    const active = await isActiveDelegate(approverId);
    if (!active) {
      throw new Error('delegation expired — vote not accepted');
    }
  }

  // 2-b. Insert vote — unique constraint (request_id, approver_id) prevents duplicates
  let vote: VoteRow;
  try {
    const { rows: voteRows } = await pool.query<VoteRow>(
      `INSERT INTO approval_votes
         (request_id, approver_id, decision, signature)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [requestId, approverId, decision, signature]
    );
    vote = voteRows[0];
  } catch (err) {
    // PostgreSQL unique violation code
    if (
      err instanceof Error &&
      (err as unknown as { code?: string }).code === '23505'
    ) {
      throw new Error('approver has already voted on this request');
    }
    throw err;
  }

  // 3. Fetch all current votes and the governing policy for quorum evaluation
  const { rows: allVotes } = await pool.query<{ decision: string }>(
    'SELECT decision FROM approval_votes WHERE request_id = $1',
    [requestId]
  );

  const { rows: policyRows } = await pool.query<QuorumPolicy>(
    'SELECT quorum_type, quorum_n, quorum_m FROM approval_policies WHERE id = $1',
    [currentRequest.policy_id]
  );

  // 4. Evaluate quorum
  const quorumResult = evaluateQuorum(
    policyRows[0],
    allVotes as Vote[]
  );

  // 5. If quorum is reached, update the request status and resolved_at
  let updatedRequest = currentRequest;
  if (quorumResult === 'approved' || quorumResult === 'denied') {
    const { rows: updatedRows } = await pool.query<RequestRow>(
      `UPDATE approval_requests
       SET status = $1, resolved_at = now()
       WHERE id = $2
       RETURNING *`,
      [quorumResult, requestId]
    );
    updatedRequest = updatedRows[0];
  }

  return { vote, request: updatedRequest, quorumResult };
}

// ── breakGlass ──────────────────────────────────────────────────────────────
// Force-approves a pending request, setting break_glass=true and
// needs_review=true for mandatory post-hoc audit. Idempotent guard:
// a request that has already been break-glassed cannot be done again.
export async function breakGlass(
  requestId: string,
  _actorId: string          // reserved for audit ledger (Phase 6)
): Promise<RequestRow> {
  // 1. Fetch request — must exist
  const { rows: existing } = await pool.query<{ status: string; break_glass: boolean }>(
    'SELECT status, break_glass FROM approval_requests WHERE id = $1',
    [requestId]
  );

  if (!existing[0]) {
    throw new Error('request not found');
  }

  // 2. Guard: cannot break-glass an already-resolved or already-broken-glass request
  if (existing[0].break_glass) {
    throw new Error('break-glass already applied to this request');
  }
  if (existing[0].status !== 'pending') {
    throw new Error(`request is already ${existing[0].status}`);
  }

  // 3. Force-approve with break_glass + needs_review flags
  const { rows } = await pool.query<RequestRow>(
    `UPDATE approval_requests
     SET status       = 'approved',
         break_glass  = true,
         needs_review = true,
         resolved_at  = now()
     WHERE id = $1
     RETURNING *`,
    [requestId]
  );

  return rows[0];
}
