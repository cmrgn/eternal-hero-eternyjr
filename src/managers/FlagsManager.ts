import type { Client } from 'discord.js'
import { sql } from 'kysely'
import { LogManager, type Severity } from './LogManager'

export class FlagsManager {
  #client: Client

  #logger: LogManager

  constructor(client: Client, severity: Severity = 'info') {
    this.#logger = new LogManager('FlagsManager', severity)
    this.#logger.log('info', 'Instantiating manager')

    this.#client = client
  }

  async hasFeatureFlag(key: string) {
    this.#logger.log('info', 'Checking if feature flag exists', { key })

    const { Database } = this.#client.managers
    const exists = await Database.db
      .selectFrom('feature_flags')
      .select('key')
      .limit(1)
      .executeTakeFirst()

    return !!exists
  }

  async getFeatureFlag(key: string) {
    const { Database } = this.#client.managers
    const response = await Database.db
      .selectFrom('feature_flags')
      .select('value')
      .where('key', '=', key)
      .executeTakeFirst()

    return response?.value
  }

  async deleteFeatureFlag(key: string) {
    this.#logger.log('info', 'Delete feature flag', { key })

    const { Database } = this.#client.managers
    const response = await Database.db.deleteFrom('feature_flags').where('key', '=', key).execute()

    return response.length > 0
  }

  async getFeatureFlags() {
    this.#logger.log('info', 'Reading all feature flags')

    const { Database } = this.#client.managers
    const flags = await Database.db.selectFrom('feature_flags').select(['key', 'value']).execute()

    return flags
  }

  async setFeatureFlag(key: string, value: boolean) {
    this.#logger.log('info', 'Setting feature flag', { key, value })

    const { Database } = this.#client.managers

    await Database.db
      .insertInto('feature_flags')
      .values({ key, updated_at: sql`now()`, value })
      .onConflict(oc =>
        oc.column('key').doUpdateSet({
          updated_at: new Date(),
          value: sql`excluded.value`,
        })
      )
      .execute()
  }

  async autocomplete(value: string) {
    const flags = await this.getFeatureFlags()
    return flags
      .filter(({ key }) => key.toLowerCase().includes(value.toLowerCase()))
      .slice(0, 25)
      .map(({ key }) => ({ name: key, value: key }))
  }
}
