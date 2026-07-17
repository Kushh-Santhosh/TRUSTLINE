/**
 * M6.1 — Signing keys table
 * Stores each user's Ed25519 keypair for cryptographic receipt signing.
 * Public key stored in plain text; private key stored symmetrically encrypted.
 * node-pg-migrate migration
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('signing_keys', {
    // user_id is both the PK and FK — one keypair per user
    user_id: {
      type: 'uuid',
      primaryKey: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    // Ed25519 public key in PEM format (plaintext)
    public_key: {
      type: 'text',
      notNull: true,
    },
    // Ed25519 private key encrypted with AES-256-GCM (hex: iv + tag + ciphertext)
    encrypted_private_key: {
      type: 'text',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('signing_keys');
};
