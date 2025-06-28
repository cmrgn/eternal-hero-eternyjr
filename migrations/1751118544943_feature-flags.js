/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
export const shorthands = undefined

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = pgm => {
  pgm.createTable('feature_flags', {
    key: { type: 'text', primaryKey: true },
    value: { type: 'boolean', notNull: true, default: false },
    updated_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  })

  pgm.createIndex('feature_flags', 'key')
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = pgm => {
  pgm.dropTable('feature_flags')
}
