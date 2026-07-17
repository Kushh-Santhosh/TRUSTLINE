/**
 * M4.7 — Add TOTP fields to users table
 * Adds totp_secret (nullable — null = not set up) and
 * totp_enabled (false until the user completes their first verify).
 * node-pg-migrate migration
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumns('users', {
    totp_secret: {
      type: 'text',
      notNull: false, // null = TOTP not set up
    },
    totp_enabled: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropColumns('users', ['totp_secret', 'totp_enabled']);
};
