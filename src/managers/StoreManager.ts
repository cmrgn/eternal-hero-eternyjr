import type { Client } from 'discord.js'
import type { File } from 'decompress'

import { logger } from '../utils/logger'
import {
  LANGUAGE_OBJECTS,
  type Locale,
  type CrowdinCode,
} from '../constants/i18n'
import { AppleStoreManager } from './AppleStoreManager'
import { GooglePlayManager } from './GooglePlayManager'

export type IapLocalizationFields = {
  name?: string /* Apple Store */
  title?: string /* Google Play */
  description?: string /* Both */
}

export type IapLocalizationEntry = {
  key: string
  translations: Record<Locale, IapLocalizationFields>
}

export class StoreManager {
  #client: Client
  appleStore: AppleStoreManager
  googlePlay: GooglePlayManager

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('StoreManager', this.#severityThreshold)

  constructor(client: Client) {
    this.#client = client
    this.appleStore = new AppleStoreManager()
    this.googlePlay = new GooglePlayManager()
  }

  async getStoreTranslations(crowdinCode: CrowdinCode) {
    this.#log('info', 'Getting in-app purchases translations', { crowdinCode })

    const { Crowdin } = this.#client.managers
    const files = await Crowdin.fetchStoreTranslations()
    const file = files.filter(file => file.path.startsWith(crowdinCode))

    return this.formatStoreTranslations(file)
  }

  formatStoreTranslations(files: File[]): IapLocalizationEntry[] {
    this.#log('info', 'Formatting store translations', { files: files.length })

    const iapMap: Map<string, IapLocalizationEntry> = new Map()

    for (const file of files) {
      const crowdinCode = file.path.split('/')[0] as CrowdinCode
      // biome-ignore lint/style/noNonNullAssertion: safe
      const { locale } = LANGUAGE_OBJECTS.find(
        languageObject => languageObject.crowdinCode === crowdinCode
      )!
      const json = file.data.toString('utf-8')
      const content: Record<string, { name: string; description: string }> =
        JSON.parse(json)

      for (const [key, value] of Object.entries(content)) {
        if (!iapMap.has(key)) {
          iapMap.set(key, { key, translations: {} } as IapLocalizationEntry)
        }

        // biome-ignore lint/style/noNonNullAssertion: safe
        const entry = iapMap.get(key)!

        if (!entry.translations[locale]) {
          entry.translations[locale] = {}
        }

        entry.translations[locale].name = value.name
        entry.translations[locale].title = value.name
        entry.translations[locale].description = value.description
      }
    }

    return Array.from(iapMap.values())
  }
}
