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

  static regionalPriceMap = {
    BR: { coefficient: 0.6, currency: 'BRL', iso3: 'BRA', name: 'Brazil' },
    CL: { coefficient: 0.7, currency: 'CLP', iso3: 'CHL', name: 'Chile' },
    CO: { coefficient: 0.7, currency: 'COP', iso3: 'COL', name: 'Colombia' },
    EG: { coefficient: 0.55, currency: 'EGP', iso3: 'EGY', name: 'Egypt' },
    ID: { coefficient: 0.55, currency: 'IDR', iso3: 'IDN', name: 'Indonesia' },
    IN: { coefficient: 0.5, currency: 'INR', iso3: 'IND', name: 'India' },
    KE: { coefficient: 0.55, currency: 'KES', iso3: 'KEN', name: 'Kenya' },
    KR: { coefficient: 0.9, currency: 'KRW', iso3: 'KOR', name: 'Korea, Republic of' },
    MX: { coefficient: 0.7, currency: 'MXN', iso3: 'MEX', name: 'Mexico' },
    NG: { coefficient: 0.5, currency: 'NGN', iso3: 'NGA', name: 'Nigeria' },
    PE: { coefficient: 0.65, currency: 'PEN', iso3: 'PER', name: 'Peru' },
    PH: { coefficient: 0.5, currency: 'PHP', iso3: 'PHL', name: 'Philippines' },
    PK: { coefficient: 0.5, currency: 'PKR', iso3: 'PAK', name: 'Pakistan' },
    PL: { coefficient: 0.75, currency: 'PLN', iso3: 'POL', name: 'Poland' },
    RU: { coefficient: 0.6, currency: 'RUB', iso3: 'RUS', name: 'Russia' },
    TH: { coefficient: 0.6, currency: 'THB', iso3: 'THA', name: 'Thailand' },
    TR: { coefficient: 0.6, currency: 'TRY', iso3: 'TUR', name: 'Türkiye' },
    UA: { coefficient: 0.6, currency: 'UAH', iso3: 'UKR', name: 'Ukraine' },
    VN: { coefficient: 0.5, currency: 'VND', iso3: 'VNM', name: 'Vietnam' },
    ZA: { coefficient: 0.6, currency: 'ZAR', iso3: 'ZAF', name: 'South Africa' },
  }

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
