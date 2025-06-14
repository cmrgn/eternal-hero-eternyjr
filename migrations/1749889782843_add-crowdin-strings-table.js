/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = pgm => {
  pgm.createTable('crowdin_strings', {
    identifier: { type: 'text', primaryKey: true },
    string_id: { type: 'integer', notNull: true },
    text: { type: 'text' },
    last_synced_at: {
      type: 'timestamp with time zone',
      default: pgm.func('current_timestamp'),
      notNull: true,
    },
  })

  // Optional: index for faster lookups if you use WHERE string_id = ...
  pgm.createIndex('crowdin_strings', 'string_id')
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = pgm => {
  pgm.dropTable('crowdin_strings')
}
