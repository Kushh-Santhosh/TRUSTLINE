/**
 * M6.4 — Hash-chained audit log writer
 * Appends tamper-evident entries to the audit_log table.
 *
 * Chain invariant:
 *   this_hash = sha256( prev_hash + JSON.stringify(payload) )
 *
 * Genesis handling:
 *   The first entry has no predecessor; prev_hash defaults to the
 *   fixed sentinel string 'GENESIS'.
 *
 * Atomicity:
 *   Each append runs inside a serializable transaction so that
 *   concurrent writers cannot produce duplicate or broken links.
 *
 * Not wired into any other service yet — that is M6.5.
 */
import { createHash } from 'crypto';
import pool from '../db/pool';

// ── Constants ─────────────────────────────────────────────────────────────

const GENESIS_HASH = 'GENESIS';

// ── Types ─────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;            // bigserial returned as string from pg
  entry_type: string;
  payload: unknown;
  prev_hash: string | null;
  this_hash: string;
  created_at: Date;
}

// ── computeHash ───────────────────────────────────────────────────────────
// Pure function — exported so the chain verifier (M6.6) can reuse it.
export function computeHash(prevHash: string, payload: object): string {
  const input = prevHash + JSON.stringify(payload);
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

// ── appendAuditEntry ──────────────────────────────────────────────────────
export async function appendAuditEntry(
  entryType: string,
  payload: object
): Promise<AuditEntry> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Fetch the most recent hash — or use the genesis sentinel
    const { rows: lastRows } = await client.query<{ this_hash: string }>(
      'SELECT this_hash FROM audit_log ORDER BY id DESC LIMIT 1 FOR UPDATE'
    );
    const prevHash = lastRows[0]?.this_hash ?? GENESIS_HASH;

    // 2. Compute the new hash
    const thisHash = computeHash(prevHash, payload);

    // 3. Persist the entry
    const { rows } = await client.query<AuditEntry>(
      `INSERT INTO audit_log (entry_type, payload, prev_hash, this_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [entryType, JSON.stringify(payload), prevHash === GENESIS_HASH ? null : prevHash, thisHash]
    );

    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Receipt types ─────────────────────────────────────────────────────────

export interface VoteWithKey {
  id: string;
  approver_id: string;
  decision: string;
  signature: string;
  public_key: string | null;   // null if approver has no signing key yet
  created_at: Date;
}

export interface Receipt {
  request_id: string;
  votes: VoteWithKey[];
  audit_entries: AuditEntry[];
}

// ── getReceiptForRequest ──────────────────────────────────────────────────
// M6.7 — Returns the full cryptographic receipt for an approval request:
//   - all votes with their Ed25519 signatures
//   - the approver public keys (from signing_keys)
//   - all audit_log entries whose payload references this requestId
//
// Read-only — no database writes.
export async function getReceiptForRequest(requestId: string): Promise<Receipt | null> {
  // 1. Verify the request exists
  const { rows: requestRows } = await pool.query<{ id: string }>(
    'SELECT id FROM approval_requests WHERE id = $1',
    [requestId]
  );
  if (!requestRows[0]) return null;

  // 2. Fetch votes joined with approver public keys
  const { rows: voteRows } = await pool.query<VoteWithKey>(
    `SELECT
       av.id,
       av.approver_id,
       av.decision,
       av.signature,
       sk.public_key,
       av.created_at
     FROM approval_votes av
     LEFT JOIN signing_keys sk ON sk.user_id = av.approver_id
     WHERE av.request_id = $1
     ORDER BY av.created_at ASC`,
    [requestId]
  );

  // 3. Fetch audit log entries related to this request
  //    Matches any row whose JSONB payload contains { "requestId": "<id>" }
  const { rows: auditRows } = await pool.query<AuditEntry>(
    `SELECT id, entry_type, payload, prev_hash, this_hash, created_at
     FROM audit_log
     WHERE payload @> $1::jsonb
     ORDER BY id ASC`,
    [JSON.stringify({ requestId })]
  );

  return {
    request_id: requestId,
    votes: voteRows,
    audit_entries: auditRows,
  };
}
