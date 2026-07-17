/**
 * M3.4 — Refresh tokens table
 * Supports refresh-token rotation with reuse detection via family_id.
 * node-pg-migrate migration
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // ── refresh_tokens ─────────────────────────────────────────────────────
  pgm.createTable('refresh_tokens', {
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
    // bcrypt / SHA-256 hash of the raw token — never store raw tokens
    token_hash: {
      type: 'text',
      notNull: true,
      unique: true,
    },
    // All tokens issued in one rotation chain share the same family_id.
    // If a revoked token is presented, the entire family is revoked (reuse detection).
    family_id: {
      type: 'uuid',
      notNull: true,
      default: pgm.func('gen_random_uuid()'),
    },
    revoked: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
    },
  });

  // Indexes for common query patterns
  pgm.createIndex('refresh_tokens', 'user_id');
  pgm.createIndex('refresh_tokens', 'family_id');
  pgm.createIndex('refresh_tokens', 'token_hash');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('refresh_tokens');
};
