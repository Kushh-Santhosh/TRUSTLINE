/**
 * M5.7 — Break-glass columns on approval_requests
 * break_glass  — true when the request was force-approved via break-glass
 * needs_review — true whenever an action bypassed normal quorum and requires
 *                post-hoc audit review.
 * node-pg-migrate migration
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumns('approval_requests', {
    break_glass: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    needs_review: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropColumns('approval_requests', ['break_glass', 'needs_review']);
};
