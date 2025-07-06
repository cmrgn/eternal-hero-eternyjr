import type { Client } from 'discord.js'

import { logger } from '../utils/logger'
import { pool } from '../utils/pg'

export class FlagsManager {
  #client: Client

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('FlagsManager', this.#severityThreshold)

  constructor(client: Client) {
    this.#log('info', 'Instantiating manager')

    this.#client = client
  }

  async getFeatureFlag(
    key: string,
    options?: { silent: boolean }
  ): Promise<boolean> {
    if (!options?.silent) this.#log('info', 'Reading feature flag', { key })

    const res = await pool.query(
      'SELECT value FROM feature_flags WHERE key = $1',
      [key]
    )

    return res.rows[0]?.value ?? false
  }

  async deleteFeatureFlag(key: string): Promise<boolean> {
    this.#log('info', 'Delete feature flag', { key })

    const res = await pool.query('DELETE FROM feature_flags WHERE key = $1', [
      key,
    ])

    return (res?.rowCount ?? 0) > 0
  }

  async getFeatureFlags(): Promise<{ key: string; value: boolean }[]> {
    this.#log('info', 'Reading all feature flags')

    const res = await pool.query('SELECT key, value FROM feature_flags')

    return res.rows
  }

  async setFeatureFlag(key: string, value: boolean) {
    this.#log('info', 'Setting feature flag', { key, value })

    await pool.query(
      `
    INSERT INTO feature_flags (key, value, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (key)
    DO UPDATE SET value = $2, updated_at = NOW()
    `,
      [key, value]
    )
  }
}
