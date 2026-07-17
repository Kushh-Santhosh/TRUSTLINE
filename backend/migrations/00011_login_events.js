/**
 * M7.1 — Login events table
 * Records per-login device/session context for risk scoring.
 * node-pg-migrate migration
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('login_events', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    // Requester IP address (IPv4 or IPv6)
    ip: {
      type: 'text',
      notNull: false,   // graceful: may be missing behind certain proxies
    },
    // Full User-Agent header value
    user_agent: {
      type: 'text',
      notNull: false,   // graceful: may be absent from programmatic clients
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // Efficient lookup for risk scoring (M7.2 queries by user_id)
  pgm.createIndex('login_events', 'user_id');
  pgm.createIndex('login_events', 'created_at');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('login_events');
};
