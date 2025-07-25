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
  pgm.addColumn('giveaways', {
    environment: { type: 'text', notNull: true, default: 'PROD' },
  })

  pgm.addConstraint('giveaways', 'check_environment_valid', {
    check: "environment IN ('PROD', 'DEV')",
  })
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = pgm => {
  pgm.dropConstraint('giveaways', 'check_environment_valid')
  pgm.dropColumn('giveaways', 'environment')
}
