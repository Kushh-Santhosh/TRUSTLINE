/**
 * M6.6 — Independent chain verifier
 * Standalone script — no trust in the running server.
 * Fetches all audit_log rows (ordered by id), recomputes each hash,
 * and reports "Chain valid up to row N" or "BROKEN at row N: expected X got Y".
 *
 * Run: npm run verify-chain
 * Exit codes: 0 = valid, 1 = broken or error
 */

// Load env before anything else (needed for DB connection string)
import '../lib/config';

import pool from '../db/pool';
import { computeHash } from '../services/audit.service';

const GENESIS_HASH = 'GENESIS';

interface AuditRow {
  id: string;
  entry_type: string;
  payload: unknown;
  prev_hash: string | null;
  this_hash: string;
  created_at: Date;
}

async function main(): Promise<void> {
  let client;
  try {
    client = await pool.connect();
    const { rows } = await client.query<AuditRow>(
      'SELECT id, entry_type, payload, prev_hash, this_hash, created_at FROM audit_log ORDER BY id ASC'
    );

    if (rows.length === 0) {
      console.log('Chain valid up to row 0 (empty log)');
      process.exit(0);
    }

    let prevHash = GENESIS_HASH;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowId = row.id;

      // Validate stored prev_hash linkage
      // (genesis row has prev_hash = null in DB; sentinel is GENESIS)
      const storedPrevHash = row.prev_hash ?? GENESIS_HASH;
      if (storedPrevHash !== prevHash) {
        console.error(
          `BROKEN at row ${rowId}: prev_hash mismatch\n` +
          `  expected prev_hash : ${prevHash}\n` +
          `  stored  prev_hash  : ${storedPrevHash}`
        );
        process.exit(1);
      }

      // Recompute this_hash and compare to stored value
      const payload = row.payload as object;
      const expected = computeHash(prevHash, payload);
      if (expected !== row.this_hash) {
        console.error(
          `BROKEN at row ${rowId}: hash mismatch\n` +
          `  expected this_hash : ${expected}\n` +
          `  stored   this_hash : ${row.this_hash}`
        );
        process.exit(1);
      }

      prevHash = row.this_hash;
    }

    const lastId = rows[rows.length - 1].id;
    console.log(`Chain valid up to row ${lastId} (${rows.length} entries verified)`);
    process.exit(0);
  } catch (err) {
    console.error('verifyChain: unexpected error —', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    client?.release();
    // Force-close the pool so the script exits cleanly
    await pool.end();
  }
}

main();
