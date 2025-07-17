import type { GiveawayData } from 'discord-giveaways'
import { Kysely, type LogEvent, PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import { type LoggerSeverity, logger } from '../utils/logger'

export class DatabaseManager {
  db: Kysely<DB>

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('DatabaseManager', this.#severityThreshold)

  constructor(severity: LoggerSeverity = 'info') {
    this.#severityThreshold = logger.LOG_SEVERITIES.indexOf(severity)
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
    this.db = new Kysely<DB>({ dialect, log: this.logEvent.bind(this) })
  }

  logEvent(event: LogEvent) {
    if (event.level === 'error') {
      this.#log('error', 'Query failed', {
        durationMs: event.queryDurationMillis,
        error: event.error,
        params: event.query.parameters,
        sql: event.query.sql,
      })
    } else {
      this.#log('info', 'Query executed', {
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
