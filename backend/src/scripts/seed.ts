/**
 * M3.8 — Seed script
 * Inserts repeatable demo data for local development.
 * Idempotent: uses ON CONFLICT DO NOTHING — safe to run multiple times.
 *
 * Usage: npm run seed
 */
import pool from '../db/pool';

async function seed(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ── Demo users ─────────────────────────────────────────────────────────
    const users = [
      { email: 'alice@demo.com', display_name: 'Alice Demo' },
      { email: 'bob@demo.com',   display_name: 'Bob Demo'   },
      { email: 'carol@demo.com', display_name: 'Carol Demo' },
    ];

    for (const u of users) {
      await client.query(
        `INSERT INTO users (email, display_name)
         VALUES ($1, $2)
         ON CONFLICT (email) DO NOTHING`,
        [u.email, u.display_name]
      );
    }

    const { rows: userRows } = await client.query(
      `SELECT id, email FROM users WHERE email = ANY($1)`,
      [users.map((u) => u.email)]
    );
    console.log('Users present:', userRows.map((r) => r.email).join(', '));

    // ── Demo approval policy — 2-of-3 quorum ──────────────────────────────
    const policyName = 'Demo 2-of-3 Quorum';
    const { rows: existing } = await client.query(
      `SELECT id FROM approval_policies WHERE name = $1`,
      [policyName]
    );

    if (existing.length === 0) {
      await client.query(
        `INSERT INTO approval_policies
           (name, quorum_type, quorum_n, quorum_m, eligible_roles,
            escalation_timeout_seconds, escalation_to, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          policyName,
          'n_of_m',
          2,                                          // quorum_n: need 2 approvals
          3,                                          // quorum_m: out of 3 eligible approvers
          JSON.stringify(['senior', 'manager']),      // eligible_roles
          3600,                                       // escalation_timeout_seconds: 1 hour
          JSON.stringify({ role: 'admin' }),          // escalation_to
          1,                                          // version
        ]
      );
      console.log('Approval policy created:', policyName);
    } else {
      console.log('Approval policy already exists:', policyName);
    }

    await client.query('COMMIT');
    console.log('\nSeed complete ✓');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed — rolled back:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
