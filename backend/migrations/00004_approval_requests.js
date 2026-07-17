/**
 * M3.6 — Approval requests + votes tables
 * The actual approval-instance data: a request raised against a policy,
 * and individual approver votes on that request.
 * node-pg-migrate migration
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // ── approval_requests ──────────────────────────────────────────────────
  pgm.createTable('approval_requests', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    // Which policy governs this request
    policy_id: {
      type: 'uuid',
      notNull: true,
      references: '"approval_policies"',
      onDelete: 'RESTRICT',
    },
    // Snapshot of the policy version at time of request — preserves audit trail
    // even if the policy is later updated (version incremented in approval_policies)
    policy_version_snapshot: {
      type: 'int',
      notNull: true,
    },
    // User who initiated the request
    requester_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'RESTRICT',
    },
    // Arbitrary action payload — e.g. { type: 'wire_transfer', amount: 50000, ... }
    action_payload: {
      type: 'jsonb',
      notNull: true,
    },
    // Lifecycle: 'pending' → 'approved' | 'denied' | 'expired'
    status: {
      type: 'text',
      notNull: true,
      default: 'pending',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    // Set when status leaves 'pending'
    resolved_at: {
      type: 'timestamptz',
      notNull: false,
    },
  });

  pgm.createIndex('approval_requests', 'policy_id');
  pgm.createIndex('approval_requests', 'requester_id');
  pgm.createIndex('approval_requests', 'status');

  // ── approval_votes ─────────────────────────────────────────────────────
  pgm.createTable('approval_votes', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    request_id: {
      type: 'uuid',
      notNull: true,
      references: '"approval_requests"',
      onDelete: 'CASCADE',
    },
    approver_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'RESTRICT',
    },
    // 'approve' | 'deny'
    decision: {
      type: 'text',
      notNull: true,
    },
    // WebAuthn / cryptographic signature over (request_id || decision)
    signature: {
      type: 'text',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // One vote per approver per request
  pgm.addConstraint(
    'approval_votes',
    'approval_votes_request_approver_unique',
    'UNIQUE (request_id, approver_id)'
  );

  pgm.createIndex('approval_votes', 'request_id');
  pgm.createIndex('approval_votes', 'approver_id');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('approval_votes');
  pgm.dropTable('approval_requests');
};
