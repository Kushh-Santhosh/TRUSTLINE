/**
 * M3.3 — Users + WebAuthn credentials tables
 * node-pg-migrate migration
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // Enable pgcrypto for gen_random_uuid()
  pgm.createExtension('pgcrypto', { ifNotExists: true });

  // ── users ──────────────────────────────────────────────────────────────
  pgm.createTable('users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    email: {
      type: 'text',
      notNull: true,
      unique: true,
    },
    display_name: {
      type: 'text',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // ── webauthn_credentials ───────────────────────────────────────────────
  pgm.createTable('webauthn_credentials', {
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
    credential_id: {
      type: 'text',
      notNull: true,
      unique: true,
    },
    public_key: {
      type: 'bytea',
      notNull: true,
    },
    counter: {
      type: 'bigint',
      notNull: true,
      default: 0,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // Index for fast user credential lookups
  pgm.createIndex('webauthn_credentials', 'user_id');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('webauthn_credentials');
  pgm.dropTable('users');
};
