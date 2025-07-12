import type { Client } from 'discord.js'
import type { File } from 'decompress'
import pLimit from 'p-limit'

import { logger } from '../utils/logger'
import {
  LANGUAGE_OBJECTS,
  type Locale,
  type CrowdinCode,
} from '../constants/i18n'
import { AppleStoreManager } from './AppleStoreManager'
import { GooglePlayManager, mergeListings } from './GooglePlayManager'

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
  #appleStore: AppleStoreManager
  #googlePlay: GooglePlayManager

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('StoreManager', this.#severityThreshold)

  constructor(client: Client) {
    this.#client = client
    this.#appleStore = new AppleStoreManager()
    this.#googlePlay = new GooglePlayManager()
  }

  formatStoreTranslations(files: File[]): IapLocalizationEntry[] {
    this.#log('info', 'Formatting store translations', { files: files.length })

    const iapMap: Map<string, IapLocalizationEntry> = new Map()

    for (const file of files) {
      const crowdinCode = file.path.split('/')[0] as CrowdinCode
      // biome-ignore lint/style/noNonNullAssertion: safe
      const locale = LANGUAGE_OBJECTS.find(
        lo => lo.crowdinCode === crowdinCode
      )!.locale
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

  async updateIapLocalization(iapId: string) {
    const { Crowdin } = this.#client.managers

    this.#log('info', 'Updating in-app purchase localization', { iapId })

    const files = await Crowdin.fetchStoreTranslations()
    const translations = this.formatStoreTranslations(files)
    const translation = translations.find(({ key }) => key === iapId)
    if (!translation)
      return this.#log('warn', 'No translation found for in-app purchase.', {
        iapId,
      })

    this.#log('info', 'Updating Google Play in-app purchase localization')
    const [appleStoreIaps, googlePlayIaps] = await Promise.all([
      this.#appleStore.fetchAllIaps(),
      this.#googlePlay.fetchAllIaps(),
    ])
    const googlePlayIap = googlePlayIaps.find(iap => iap.sku === iapId)
    if (!googlePlayIap)
      return this.#log('warn', 'No Google Play in-app purchase found.', {
        iapId,
      })

    const appleStoreIap = appleStoreIaps.find(
      iap => iap.attributes.productId === iapId
    )
    if (!appleStoreIap)
      return this.#log('warn', 'No Apple Store in-app purchase found.', {
        iapId,
      })

    await Promise.all([
      /*this.#googlePlay.updateIapLocalization(
        googlePlayIap,
        translation.translations
      ),*/
      ...LANGUAGE_OBJECTS.filter(
        languageObject => languageObject.locale in translation.translations
      ).map(languageObject =>
        this.#appleStore.updateIapLocalization(
          languageObject,
          appleStoreIap,
          translation.translations[languageObject.locale]
        )
      ),
    ])
  }

  async updateIapLocalizations() {
    const { Crowdin } = this.#client.managers

    this.#log('info', 'Updating in-app purchases localizations')

    const files = await Crowdin.fetchStoreTranslations()
    const translations = this.formatStoreTranslations(files)
    const [appleStoreIaps, googlePlayIaps] = await Promise.all([
      this.#appleStore.fetchAllIaps(),
      this.#googlePlay.fetchAllIaps(),
    ])

    this.#log('info', 'Updating Google Play in-app purchases localizations')
    const googlePlayLimit = pLimit(5)
    await Promise.all(
      googlePlayIaps
        // @TODO: remove comparison after test
        .filter(iap => iap.sku === 'costume_angel')
        .map(iap => {
          const translation = translations.find(({ key }) => key === iap.sku)
          if (!translation) return
          return googlePlayLimit(() =>
            this.#googlePlay.updateIapLocalization(iap, {
              // @TODO: remove pick after test
              'fr-FR': translation.translations['fr-FR'],
            })
          )
        })
        .filter(Boolean)
    )

    this.#log('info', 'Updating Apple Store in-app purchases localizations')
    const appleStoreLimit = pLimit(5)
    // @TODO: remove filter after test
    const languages = Crowdin.getLanguages({ withEnglish: false }).filter(
      language => language.crowdinCode === 'fr'
    )
    await Promise.all(
      appleStoreIaps
        // @TODO: remove comparison after test
        .filter(iap => iap.attributes.productId === 'costume_angel')
        .map(iap => {
          return appleStoreLimit(() =>
            Promise.all(
              languages.map(language => {
                const iapTranslations = translations.find(
                  ({ key }) => key === iap.attributes.productId
                )
                if (!iapTranslations) return
                return this.#appleStore.updateIapLocalization(
                  language,
                  iap,
                  iapTranslations.translations[language.locale]
                )
              })
            )
          )
        })
    )
  }
}
