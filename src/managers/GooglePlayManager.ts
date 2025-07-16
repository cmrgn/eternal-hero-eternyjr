import { type androidpublisher_v3, google } from 'googleapis'
import { LANGUAGE_OBJECTS, type Locale } from '../constants/i18n'
import { type LoggerSeverity, logger } from '../utils/logger'
import { withRetry } from '../utils/withRetry'

export type IapLocalizationFields = { title: string; description: string }

type Listing = IapLocalizationFields
type Listings = Partial<Record<Locale, Listing>>
export type InAppPurchase = {
  sku?: string | null
  status?: string | null
  defaultLanguage?: string | null
  listings?: Listings | null
}

export class GooglePlayManager {
  #ap: androidpublisher_v3.Androidpublisher

  #packageName = 'games.rivvy.eternalherorpg'

  #cache: {
    data: InAppPurchase[] | null
    lastFetchedAt: number
    ttl: number
  } = {
    data: null,
    lastFetchedAt: 0,
    ttl: 15 * 60 * 1000, // 15 minutes
  }

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('GooglePlayManager', this.#severityThreshold)

  constructor(severity: LoggerSeverity = 'info') {
    this.#severityThreshold = logger.LOG_SEVERITIES.indexOf(severity)
    this.#log('debug', 'Instantiating manager')
    this.#ap = google.androidpublisher({
      auth: this.generateAuth(),
      version: 'v3',
    })
  }

  generateAuth() {
    if (!process.env.GOOGLE_PLAY_CLIENT_EMAIL) {
      throw new Error('Missing environment variable GOOGLE_PLAY_CLIENT_EMAIL; aborting.')
    }

    if (!process.env.GOOGLE_PLAY_PRIVATE_KEY) {
      throw new Error('Missing environment variable GOOGLE_PLAY_PRIVATE_KEY; aborting.')
    }

    const pkey = process.env.GOOGLE_PLAY_PRIVATE_KEY.replace(/\\n/g, '\n')
    const email = process.env.GOOGLE_PLAY_CLIENT_EMAIL

    return new google.auth.JWT({
      email,
      key: pkey,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    })
  }

  async getAllIaps() {
    this.#log('info', 'Getting all in-app purchases')

    const now = Date.now()

    if (this.#cache.data && now - this.#cache.lastFetchedAt < this.#cache.ttl) {
      this.#log('debug', 'Returning all in-app purchases from the cache')

      return this.#cache.data
    }

    const response = await withRetry(attempt => {
      this.#log('debug', 'Fetching all in-app purchases', { attempt })

      return this.#ap.inappproducts.list({
        maxResults: 1000, // optional, default is 100
        packageName: this.#packageName,
      })
    })

    const iaps: InAppPurchase[] =
      response.data.inappproduct?.map(({ sku, status, defaultLanguage, listings }) => ({
        defaultLanguage,
        listings,
        sku,
        status,
      })) ?? []

    if (iaps.length > 0) {
      this.#log('debug', 'Caching all in-app purchases', { count: iaps.length })

      this.#cache.data = iaps
      this.#cache.lastFetchedAt = now
    }

    return iaps
  }

  async updateIapLocalization(iap: InAppPurchase, listings: Listings) {
    this.#log('info', 'Updating in-app purchase localization', {
      id: iap.sku,
      listings,
    })

    if (!iap.sku) {
      return this.#log('warn', 'Missing in-app purchase SKU for update; aborting', {
        id: iap.sku,
        listings,
      })
    }

    return this.#ap.inappproducts.patch({
      autoConvertMissingPrices: true,
      packageName: this.#packageName,
      requestBody: {
        listings: GooglePlayManager.mergeListings(iap.listings, listings),
        packageName: this.#packageName,
        sku: iap.sku,
      },
      sku: iap.sku,
    })
  }

  static mergeListings(base?: Listings | null, overrides?: Listings | null) {
    base ??= {} as Listings
    overrides ??= {} as Listings

    const merged = { ...base }

    for (const [lang, values] of Object.entries(overrides)) {
      const languageObject = LANGUAGE_OBJECTS.find(
        languageObject =>
          languageObject.locale === lang ||
          languageObject.googlePlayLocale === lang ||
          languageObject.twoLettersCode === lang
      )
      const locale = (languageObject?.googlePlayLocale ?? languageObject?.locale ?? lang) as Locale
      merged[locale] = Object.assign({ description: '', title: '' }, base[locale], {
        description: values.description,
        title: values.title,
      })
    }

    return merged
  }
}
