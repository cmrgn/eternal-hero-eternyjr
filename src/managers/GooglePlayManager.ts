import { type androidpublisher_v3, google } from 'googleapis'

import { logger } from '../utils/logger'
import type { Locale } from '../constants/i18n'
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

  #cachedIaps: InAppPurchase[] | null = null
  #lastFetchedAtIaps = 0
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

    const pkey = process.env.GOOGLE_PLAY_PRIVATE_KEY.replace(/\\n/g, '\n')
    const email = process.env.GOOGLE_PLAY_CLIENT_EMAIL

    return new google.auth.JWT({
      email,
      key: pkey,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    })
  }

  async fetchAllIaps() {
    this.#log('info', 'Fetching all in-app purchases')

    const now = Date.now()

    if (this.#cachedIaps && now - this.#lastFetchedAtIaps < this.#cacheTTL) {
      return this.#cachedIaps
    }

    const response = await withRetry(() =>
      this.#ap.inappproducts.list({
        packageName: this.#packageName,
        maxResults: 1000, // optional, default is 100
      })
    )

    const iaps: InAppPurchase[] =
      response.data.inappproduct?.map(
        ({ sku, status, defaultLanguage, listings }) => ({
          sku,
          status,
          defaultLanguage,
          listings,
        })
      ) ?? []

    if (iaps.length > 0) {
      this.#cachedIaps = iaps
      this.#lastFetchedAtIaps = now
    }

    return iaps
  }

  async updateIapLocalization(iap: InAppPurchase, listings: Listings) {
    this.#log('info', 'Updating in-app purchase localization', {
      id: iap.sku,
      listings,
    })

    if (!iap.sku) return

    return this.#ap.inappproducts.patch({
      packageName: this.#packageName,
      sku: iap.sku,
      autoConvertMissingPrices: true,
      requestBody: {
        packageName: this.#packageName,
        sku: iap.sku,
        listings: GooglePlayManager.mergeListings(iap.listings, listings),
      },
    })
  }

  static mergeListings(base?: Listings | null, overrides?: Listings | null) {
    base ??= {} as Listings
    overrides ??= {} as Listings

    const merged = { ...base }

    for (const [lang, values] of Object.entries(overrides)) {
      // Okay Google… 🫠
      const locale = (lang === 'vi-VN' ? 'vi' : lang) as Locale
      merged[locale] = Object.assign(
        { title: '', description: '' },
        base[locale],
        { title: values.title, description: values.description }
      )
    }

    return merged
  }
}
