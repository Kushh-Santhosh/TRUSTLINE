/**
 * M3.7 — Audit log table (hash-chained)
 * Append-only ledger for TrustLine non-repudiation.
 * Each row links to the previous row via prev_hash → this_hash, forming
 * a tamper-evident chain. Append-only is enforced at the application layer
 * (see ledger service in Phase 6), not the DB layer.
 * node-pg-migrate migration
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('audit_log', {
    // bigserial gives monotonically increasing IDs — ordering is guaranteed
    id: {
      type: 'bigserial',
      primaryKey: true,
    },
    // Event category: e.g. 'auth.login', 'approval.vote', 'approval.resolved'
    entry_type: {
      type: 'text',
      notNull: true,
    },
    // Full event payload — actor, resource, outcome, metadata
    payload: {
      type: 'jsonb',
      notNull: true,
    },
    // SHA-256 hash of the previous row's this_hash — null for the genesis entry
    prev_hash: {
      type: 'text',
      notNull: false,
    },
    // SHA-256 hash of (id || entry_type || payload || prev_hash) — computed at insert time
    this_hash: {
      type: 'text',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // Index for time-range queries and ledger replay
  pgm.createIndex('audit_log', 'created_at');
  // Index for event-type filtering
  pgm.createIndex('audit_log', 'entry_type');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('audit_log');
};
