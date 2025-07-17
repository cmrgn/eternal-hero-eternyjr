import { Convert } from 'easy-currencies'
import { type androidpublisher_v3, google } from 'googleapis'
import type { androidpublisher_v3 as AndroidPublisher } from 'googleapis/build/src/apis/androidpublisher/v3'
import pMap from 'p-map'
import { LANGUAGE_OBJECTS, type Locale } from '../constants/i18n'
import { withRetry } from '../utils/withRetry'
import { LogManager, type Severity } from './LogManager'

export type IapLocalizationFields = { title: string; description: string }

type Listing = IapLocalizationFields
type Listings = Partial<Record<Locale, Listing>>
export type InAppPurchase = AndroidPublisher.Schema$InAppProduct

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

  static regionalPriceMap = {
    BD: 0.5, // Bangladesh
    BR: 0.6, // Brazil
    CL: 0.7, // Chile
    CO: 0.7, // Colombia
    EG: 0.55, // Egypt
    ID: 0.55, // Indonesia
    IN: 0.5, // India
    KE: 0.55, // Kenya
    KR: 0.9, // Korea
    MX: 0.7, // Mexico
    NG: 0.5, // Nigeria
    PE: 0.65, // Peru
    PH: 0.5, // Philippines
    PK: 0.5, // Pakistan
    PL: 0.75, // Poland
    RU: 0.6, // Russia
    TH: 0.6, // Thailand
    TR: 0.6, // Türkie
    UA: 0.6, // Ukraine
    VN: 0.5, // Vietnam
    ZA: 0.6, // South Africa
  }

  #logger: LogManager

  constructor(severity: Severity = 'info') {
    this.#logger = new LogManager('GooglePlayManager', severity)
    this.#logger.log('info', 'Instantiating manager')
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
    this.#logger.log('info', 'Getting all in-app purchases')

    const now = Date.now()

    if (this.#cache.data && now - this.#cache.lastFetchedAt < this.#cache.ttl) {
      this.#logger.log('info', 'Returning all in-app purchases from the cache')

      return this.#cache.data
    }

    const response = await withRetry(
      attempt => {
        this.#logger.log('info', 'Fetching all in-app purchases', { attempt })

        return this.#ap.inappproducts.list({
          maxResults: 1000, // optional, default is 100
          packageName: this.#packageName,
        })
      },
      { logger: this.#logger }
    )

    const iaps: InAppPurchase[] =
      response.data.inappproduct?.map(({ sku, status, defaultLanguage, listings }) => ({
        defaultLanguage,
        listings,
        sku,
        status,
      })) ?? []

    if (iaps.length > 0) {
      this.#logger.log('info', 'Caching all in-app purchases', { count: iaps.length })

      this.#cache.data = iaps
      this.#cache.lastFetchedAt = now
    }

    return iaps
  }

  async updateIapLocalization(iap: InAppPurchase, listings: Listings) {
    this.#logger.log('info', 'Updating in-app purchase localization', {
      id: iap.sku,
      listings,
    })

    if (!iap.sku) {
      return this.#logger.log('warn', 'Missing in-app purchase SKU for update; aborting', {
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

  async localizeIapPrices(iap: InAppPurchase) {
    if (!iap.sku) {
      return this.#logger.log('warn', 'Could not retrieve SKU for in-app purchase; skipping', {
        sku: iap.sku,
      })
    }

    if (!iap.defaultPrice?.priceMicros) {
      return this.#logger.log(
        'warn',
        'Could not retrieve default price for in-app purchase; skipping',
        { sku: iap.sku }
      )
    }

    if (!iap.defaultPrice.currency) {
      return this.#logger.log(
        'warn',
        'Could not retrieve default currency for in-app purchase; skipping',
        { sku: iap.sku }
      )
    }

    // Start from the default price (which is *designed* in dollars, but *expressed* in Turkish
    // liras because the Google Play Store account is Turkish), and convert it to the regional
    // currency
    const defaultPrice = +iap.defaultPrice.priceMicros
    const fromCurrency = iap.defaultPrice.currency
    const updatedPrices: Record<string, { currency: string; priceMicros: string }> = {}
    const currentPrices: Record<string, { currency: string; priceMicros: string }> = {}

    await Promise.all(
      Object.entries(GooglePlayManager.regionalPriceMap).map(async ([region, multiplier]) => {
        this.#logger.log('debug', 'Localizing in-app purchase price', {
          multiplier,
          region,
          sku: iap.sku,
        })

        if (!iap.prices?.[region]?.currency) {
          return this.#logger.log(
            'warn',
            'Could not retrieve regional currency for in-app purchase; skipping',
            { multiplier, region, sku: iap.sku }
          )
        }

        // Retrieve the currency associated to the given region
        const toCurrency = iap.prices[region].currency
        const localizedDefaultPrice = await Convert(defaultPrice).from(fromCurrency).to(toCurrency)

        // The new price is the localized default price times the mulitiplier
        const localizedAdjustedPrice =
          Math.round((localizedDefaultPrice * multiplier) / 1_000_000) * 1_000_000

        currentPrices[region] = {
          currency: toCurrency,
          priceMicros: iap.prices[region].priceMicros ?? 'undefined',
        }

        updatedPrices[region] = {
          currency: toCurrency,
          priceMicros: String(localizedAdjustedPrice),
        }
      })
    )

    this.#logger.log('info', 'Updating in-app purchase price', {
      currentPrices,
      sku: iap.sku,
      updatedPrices,
    })

    return this.#ap.inappproducts.patch({
      autoConvertMissingPrices: true,
      packageName: this.#packageName,
      requestBody: { packageName: this.#packageName, prices: updatedPrices, sku: iap.sku },
      sku: iap.sku,
    })
  }

  async getIap(sku: string) {
    const response = await this.#ap.inappproducts.get({ packageName: this.#packageName, sku })
    return response.data
  }

  async localizeAllPrices(concurrency = 5) {
    const iaps = await this.getAllIaps()
    return pMap(iaps, iap => this.localizeIapPrices(iap), { concurrency })
  }
}
