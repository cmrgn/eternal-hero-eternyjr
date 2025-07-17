import type { File } from 'decompress'
import type { Client } from 'discord.js'
import { type CrowdinCode, LANGUAGE_OBJECTS, type Locale } from '../constants/i18n'
import {
  type IapLocalizationFields as AppleStoreIapLocalizationFields,
  AppleStoreManager,
} from './AppleStoreManager'
import {
  type IapLocalizationFields as GooglePlayIapLocalizationFields,
  GooglePlayManager,
} from './GooglePlayManager'
import { LogManager, type Severity } from './LogManager'

export type IapLocalizationFields = AppleStoreIapLocalizationFields &
  GooglePlayIapLocalizationFields

export class StoreManager {
  #client: Client
  appleStore: AppleStoreManager
  googlePlay: GooglePlayManager

  #logger: LogManager

  constructor(client: Client, severity: Severity = 'info') {
    this.#client = client
    this.appleStore = new AppleStoreManager()
    this.googlePlay = new GooglePlayManager()
    this.#logger = new LogManager('GooglePlayManager', severity)
    this.#logger.log('info', 'Instantiating manager')
  }

  async getStoreTranslations(crowdinCode: CrowdinCode) {
    this.#logger.log('info', 'Getting in-app purchases translations', { crowdinCode })

    const { Crowdin } = this.#client.managers
    const files = await Crowdin.fetchStoreTranslations()
    const file = files.filter(file => file.path.startsWith(crowdinCode))

    return this.formatStoreTranslations(file)
  }

  parseFileData(file: File) {
    this.#logger.log('info', 'Parsing file data', { file })

    const json = file.data.toString('utf-8')
    const data: Record<string, { name: string; description: string }> = JSON.parse(json)

    if (!data || typeof data !== 'object') {
      this.#logger.log('warn', 'Invalid JSON in Crowdin file', { path: file.path })
    }

    return data
  }

  formatStoreTranslations(files: File[]) {
    this.#logger.log('info', 'Formatting store translations', { files: files.length })

    const iapMap = new Map<string, Record<Locale, IapLocalizationFields>>()

    for (const file of files) {
      const crowdinCode = file.path.split('/')[0] as CrowdinCode
      const languageObject = LANGUAGE_OBJECTS.find(
        languageObject => languageObject.crowdinCode === crowdinCode
      )

      if (!languageObject) {
        throw new Error(`Could not retrieve language object for \`${crowdinCode}\`.`)
      }

      const { locale } = languageObject
      const content = this.parseFileData(file)

      for (const [key, value] of Object.entries(content)) {
        if (!iapMap.has(key)) iapMap.set(key, {} as Record<Locale, IapLocalizationFields>)

        // Compatibility: Crowdin keys use `name`, Apple Store uses `name`, but Google Play uses
        // `title` (copied from `name`)
        // biome-ignore lint/style/noNonNullAssertion:safe
        iapMap.get(key)![locale] = { ...value, title: value.name }
      }
    }

    return iapMap
  }
}
