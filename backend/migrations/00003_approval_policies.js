/**
 * M3.5 — Approval policy table
 * Stores quorum/policy definitions for the TrustLine approval engine.
 * node-pg-migrate migration
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('approval_policies', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    // Human-readable policy name
    name: {
      type: 'text',
      notNull: true,
    },
    // Quorum algorithm: 'n_of_m' | 'role_weighted' | 'single_senior'
    quorum_type: {
      type: 'text',
      notNull: true,
    },
    // For n_of_m: require quorum_n approvals out of quorum_m eligible approvers
    quorum_n: {
      type: 'int',
      notNull: false,
    },
    quorum_m: {
      type: 'int',
      notNull: false,
    },
    // JSONB array of role names that are eligible to approve
    eligible_roles: {
      type: 'jsonb',
      notNull: true,
    },
    // Seconds before the request is automatically escalated
    escalation_timeout_seconds: {
      type: 'int',
      notNull: false,
    },
    // JSONB describing escalation target (role, user list, etc.)
    escalation_to: {
      type: 'jsonb',
      notNull: false,
    },
    // Optional JSONB geo-fence — null means no geo restriction
    geo_fence: {
      type: 'jsonb',
      notNull: false,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    // Policy versioning — increment when policy changes to preserve audit trail
    version: {
      type: 'int',
      notNull: true,
      default: 1,
    },
  });

  // Index for lookups by name
  pgm.createIndex('approval_policies', 'name');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('approval_policies');
};
