import type { GiveawayData } from 'discord-giveaways'
import { Kysely, type LogEvent, PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import { LogManager, type Severity } from './LogManager'

export class DatabaseManager {
  db: Kysely<DB>

  #logger: LogManager

  constructor(severity: Severity = 'info') {
    this.#logger = new LogManager('DatabaseManager', severity)
    this.#logger.log('info', 'Instantiating manager')

    if (!process.env.DATABASE_URL) {
      throw new Error('Missing environment variable DATABASE_URL; aborting.')
    }

    const connectionString = process.env.DATABASE_URL
    const pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    })
    const dialect = new PostgresDialect({ pool })
    this.db = new Kysely<DB>({ dialect, log: this.logEvent.bind(this) })
  }

  logEvent(event: LogEvent) {
    if (event.level === 'error') {
      this.#logger.log('error', 'Query failed', {
        durationMs: event.queryDurationMillis,
        error: event.error,
        params: event.query.parameters,
        sql: event.query.sql,
      })
    } else {
      this.#logger.log('info', 'Query executed', {
        durationMs: event.queryDurationMillis,
        params: event.query.parameters,
        sql: event.query.sql,
      })
    }
  }

  destroy() {
    return this.db.destroy()
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
