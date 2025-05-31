/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // Create giveaways table
  pgm.createTable('giveaways', {
    id: { type: 'text', notNull: true, primaryKey: true },
    data: { type: 'jsonb', notNull: true },
  })

  // Create faq_leaderboard table
  pgm.createTable('faq_leaderboard', {
    guild_id: { type: 'text', notNull: true },
    used_id: { type: 'text', notNull: true },
    contribution_count: { type: 'integer', notNull: true, default: 0 },
  })

  // Composite primary key
  pgm.addConstraint('faq_leaderboard', 'pk_faq_leaderboard', {
    primaryKey: ['guild_id', 'used_id'],
  })

  // Optional: enforce non-negative contribution count
  pgm.addConstraint('faq_leaderboard', 'check_nonnegative_contribution_count', {
    check: 'contribution_count >= 0',
  })
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('faq_leaderboard')
  pgm.dropTable('giveaways')
}
