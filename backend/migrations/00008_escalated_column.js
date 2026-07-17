/**
 * M5.6 — Add escalated column to approval_requests
 * Tracks whether a pending request has been flagged as stalled
 * by the escalation job.
 * node-pg-migrate migration
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumns('approval_requests', {
    escalated: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
  });

  // Index to make the escalation job query efficient
  // (WHERE status = 'pending' AND escalated = false)
  pgm.createIndex('approval_requests', ['status', 'escalated']);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropIndex('approval_requests', ['status', 'escalated']);
  pgm.dropColumns('approval_requests', ['escalated']);
};
