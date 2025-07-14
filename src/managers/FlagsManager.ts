import type { Client } from 'discord.js'
import { sql } from 'kysely'

import { logger } from '../utils/logger'

export class FlagsManager {
  #client: Client

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('FlagsManager', this.#severityThreshold)

  constructor(client: Client) {
    this.#log('info', 'Instantiating manager')

    this.#client = client
  }

  async hasFeatureFlag(key: string, options?: { silent: boolean }) {
    if (!options?.silent) this.#log('info', 'Checking if feature flag exists', { key })

    const { Database } = this.#client.managers
    const exists = await Database.db
      .selectFrom('feature_flags')
      .select('key')
      .limit(1)
      .executeTakeFirst()

    return !!exists
  }

  async getFeatureFlag(key: string, options?: { silent: boolean }) {
    if (!options?.silent) this.#log('info', 'Reading feature flag', { key })

    const { Database } = this.#client.managers
    const response = await Database.db
      .selectFrom('feature_flags')
      .select('value')
      .where('key', '=', key)
      .executeTakeFirst()

    return response?.value
  }

  async deleteFeatureFlag(key: string) {
    this.#log('info', 'Delete feature flag', { key })

    const { Database } = this.#client.managers
    const response = await Database.db.deleteFrom('feature_flags').where('key', '=', key).execute()

    return response.length > 0
  }

  async getFeatureFlags() {
    this.#log('info', 'Reading all feature flags')

    const { Database } = this.#client.managers
    const flags = await Database.db.selectFrom('feature_flags').select(['key', 'value']).execute()

    return flags
  }

  async setFeatureFlag(key: string, value: boolean) {
    this.#log('info', 'Setting feature flag', { key, value })

    const { Database } = this.#client.managers

    await Database.db
      .insertInto('feature_flags')
      .values({ key, value, updated_at: sql`now()` })
      .onConflict(oc =>
        oc.column('key').doUpdateSet({
          value: sql`excluded.value`,
          updated_at: new Date(),
        })
      )
      .execute()
  }
}
