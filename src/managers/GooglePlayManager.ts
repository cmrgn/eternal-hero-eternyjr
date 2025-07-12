import { type androidpublisher_v3, google } from 'googleapis'

import { logger } from '../utils/logger'
import type { Locale } from '../constants/i18n'
import type { IapLocalizationFields } from './StoreManager'

export type Listing = Omit<IapLocalizationFields, 'name'>
export type Listings = Partial<Record<Locale, Listing>>
export type ListingWithName = IapLocalizationFields
export type ListingsWithName = Partial<Record<Locale, ListingWithName>>
export type InAppPurchase = {
  sku?: string | null
  status?: string | null
  defaultLanguage?: string | null
  listings?: Listings | null
}

export class GooglePlayManager {
  #ap: androidpublisher_v3.Androidpublisher

  #packageName = 'games.rivvy.eternalherorpg'

  #cachedIAPs: InAppPurchase[] | null = null
  #lastFetchedAtIAPs = 0
  #cacheTTL = 15 * 60 * 1000 // 15 minutes

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('GooglePlayManager', this.#severityThreshold)

  constructor() {
    this.#log('info', 'Instantiating manager')
    this.#ap = google.androidpublisher({
      version: 'v3',
      auth: this.generateAuth(),
    })
  }

  generateAuth() {
    if (!process.env.GOOGLE_PLAY_CLIENT_EMAIL) {
      throw new Error(
        'Missing environment variable GOOGLE_PLAY_CLIENT_EMAIL; aborting.'
      )
    }

    if (!process.env.GOOGLE_PLAY_PRIVATE_KEY) {
      throw new Error(
        'Missing environment variable GOOGLE_PLAY_PRIVATE_KEY; aborting.'
      )
    }

    return new google.auth.JWT({
      email: process.env.GOOGLE_PLAY_CLIENT_EMAIL,
      key: process.env.GOOGLE_PLAY_PRIVATE_KEY,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    })
  }

  async fetchAllIaps() {
    this.#log('info', 'Fetching all IAPs')

    const now = Date.now()

    if (this.#cachedIAPs && now - this.#lastFetchedAtIAPs < this.#cacheTTL) {
      return this.#cachedIAPs
    }

    const response = await this.#ap.inappproducts.list({
      packageName: this.#packageName,
      maxResults: 1000, // optional, default is 100
    })

    const IAPs =
      response.data.inappproduct?.map(
        product =>
          ({
            sku: product.sku,
            status: product.status,
            defaultLanguage: product.defaultLanguage,
            listings: product.listings,
          }) as InAppPurchase
      ) ?? []

    if (IAPs.length > 0) {
      this.#cachedIAPs = IAPs
      this.#lastFetchedAtIAPs = now
    }

    return IAPs
  }

  async updateIapLocalization(iap: InAppPurchase, listings: ListingsWithName) {
    this.#log('info', 'Updating IAP localization', {
      id: iap.sku,
      listings,
    })

    if (!iap.sku) return

    const response = await this.#ap.inappproducts.patch({
      packageName: this.#packageName,
      sku: iap.sku,
      autoConvertMissingPrices: true,
      requestBody: {
        packageName: this.#packageName,
        sku: iap.sku,
        listings: mergeListings(iap.listings, listings),
      },
    })

    this.#log('info', 'Successfully updated IAP localization', {
      id: iap.sku,
      listings,
    })

    return response
  }
}

export function mergeListings(
  base?: Listings | null,
  overrides?: Listings | null
) {
  base ??= {} as Listings
  overrides ??= {} as Listings

  const merged = { ...base }

  for (const [lang, values] of Object.entries(overrides)) {
    const locale = lang as Locale
    merged[locale] = base[locale] ?? {}
    merged[locale].title = values.title
    merged[locale].description = values.description
  }

  return merged
}
