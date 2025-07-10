import type { GiveawayData } from 'discord-giveaways'
import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'

import { logger } from '../utils/logger'

export class DatabaseManager {
  db: Kysely<DB>

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('DatabaseManager', this.#severityThreshold)

  constructor() {
    this.#log('info', 'Instantiating manager')

    if (!process.env.DATABASE_URL) {
      throw new Error('Missing environment variable DATABASE_URL; aborting.')
    }

    const connectionString = process.env.DATABASE_URL
    const pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    })
    const dialect = new PostgresDialect({ pool })
    this.db = new Kysely<DB>({ dialect })
  }
}

export interface DB {
  faq_leaderboard: {
    user_id: string
    contribution_count: number
    guild_id: string
  }

  feature_flags: {
    key: string
    value: boolean
    updated_at: Date
  }

  giveaways: {
    id: string
    data: GiveawayData
    environment: 'PROD' | 'DEV'
  }

  pgmigrations: {
    id: number
    name: string
    run_on: Date
  }
}
