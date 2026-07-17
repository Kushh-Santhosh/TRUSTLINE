/**
 * M5.5 — Delegations table
 * Records temporary approver-to-approver delegations with a hard expiry.
 * node-pg-migrate migration
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('delegations', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    // The approver delegating their vote authority
    delegator_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    // The user receiving the delegated vote authority
    delegate_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    // Hard expiry — once past this timestamp the delegation is void
    expires_at: {
      type: 'timestamptz',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('delegations', 'delegate_id');
  pgm.createIndex('delegations', 'delegator_id');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('delegations');
};
