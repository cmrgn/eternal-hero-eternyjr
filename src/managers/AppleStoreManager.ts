import fs from 'node:fs/promises'
import jwt from 'jsonwebtoken'
import removeAccents from 'remove-accents'
import type { LanguageObject } from '../constants/i18n'
import { request } from '../utils/request'
import { LogManager, type Severity } from './LogManager'
import { StoreManager } from './StoreManager'

export type IapLocalizationFields = { name: string; description: string }

type RelationshipLink = {
  links: { self: string; related: string; next?: string }
}
export type InAppPurchase = RelationshipLink & {
  type: 'inAppPurchases'
  id: string
  attributes: {
    state?: 'APPROVED' | 'ACTIVE'
    name?: string
    description?: string
    productId: string
    locale: string
  }
  relationships: { inAppPurchaseLocalizations: RelationshipLink }
}

type InAppPurchasePrices = RelationshipLink & {
  type: 'inAppPurchasePrices'
  id: string
  attributes: { startDate: string | null; endDate: string | null; manual: boolean }
  relationships: { inAppPurchasePricePoint: { data: { id: string } } }
}

type AppleApiResponse<T> = {
  data: T[]
  links?: { next?: string }
}

export class AppleStoreManager {
  #jwt: string | null = null
  #jwtIssuedAt = 0
  #jwtTtl = 5 * 60 // 5 minutes

  #apiUrl = 'https://api.appstoreconnect.apple.com/v1'
  #appId = '6503089848'

  #priceMatrix: Record<string, Record<string, number>> | null = null

  #cache: {
    data: InAppPurchase[] | null
    lastFetchedAt: number
    ttl: number
  } = {
    data: null,
    lastFetchedAt: 0,
    ttl: 15 * 60 * 1000, // 15 minutes
  }

  #logger: LogManager

  constructor(severity: Severity = 'info') {
    this.#logger = new LogManager('AppleStoreManager', severity)
    this.#logger.log('info', 'Instantiating manager')
    this.#jwt = this.generateJwt()
    this.loadPriceMatrix()
  }

  get headers() {
    const now = Math.floor(Date.now() / 1000)
    const expiresAt = this.#jwtIssuedAt + this.#jwtTtl - 1

    if (!this.#jwt || now >= expiresAt) {
      this.#jwt = this.generateJwt()
      this.#jwtIssuedAt = now
    }

    return {
      Authorization: `Bearer ${this.#jwt}`,
      'Content-Type': 'application/json',
    }
  }

  async loadPriceMatrix() {
    const content = await fs.readFile('./matrix.json', 'utf-8')
    const data = JSON.parse(content)
    this.#priceMatrix = data
  }

  get priceMatrix() {
    if (!this.#priceMatrix) {
      throw new Error('Attempting to access price matrix before it gets initialized.')
    }

    return this.#priceMatrix
  }

  generateJwt() {
    if (!process.env.APPLE_STORE_ISSUER_ID) {
      throw new Error('Missing environment variable APPLE_STORE_ISSUER_ID; aborting.')
    }

    if (!process.env.APPLE_STORE_KEY_ID) {
      throw new Error('Missing environment variable APPLE_STORE_KEY_ID; aborting.')
    }

    if (!process.env.APPLE_STORE_PRIVATE_KEY) {
      throw new Error('Missing environment variable APPLE_STORE_PRIVATE_KEY; aborting.')
    }

    const pkey = process.env.APPLE_STORE_PRIVATE_KEY.replace(/\\n/g, '\n')
    const issuer = process.env.APPLE_STORE_ISSUER_ID
    const kid = process.env.APPLE_STORE_KEY_ID

    const now = Math.round(Date.now() / 1000)
    const expireIn = now + this.#jwtTtl - 1
    const token = jwt.sign(
      {
        aud: 'appstoreconnect-v1',
        exp: expireIn,
        iss: issuer,
      },
      pkey,
      {
        algorithm: 'ES256',
        header: { alg: 'ES256', kid, typ: 'JWT' },
      }
    )

    return token
  }

  callApi<T>(path: string, method = 'GET', payload?: unknown): Promise<AppleApiResponse<T>> {
    const body = JSON.stringify(payload)
    const context = { body, method, path }
    const headers = this.headers

    this.#logger.log('info', 'Calling Apple Store API', context)
    return request(this.#logger, path, { body, headers, method })
  }

  async getAllIaps() {
    this.#logger.log('info', 'Fetching all in-app purchases')

    const getAllPages = async (initialUrl: string) => {
      let results: InAppPurchase[] = []
      let nextUrl: string | null = initialUrl

      while (nextUrl) {
        const response: AppleApiResponse<InAppPurchase> = await this.callApi(nextUrl)
        results = results.concat(...response.data)
        nextUrl = response.links?.next ?? null
      }

      return results
    }

    const now = Date.now()
    if (this.#cache.data && now - this.#cache.lastFetchedAt < this.#cache.ttl) {
      return this.#cache.data
    }

    const data = await getAllPages(`${this.#apiUrl}/apps/${this.#appId}/inAppPurchasesV2`)

    if (data.length > 0) {
      this.#cache.data = data
      this.#cache.lastFetchedAt = now
    }

    return data
  }

  async getIapLocalization(locale: string, relatedUrl: string) {
    this.#logger.log('info', 'Getting in-app purchase localization', {
      locale,
      relatedUrl,
    })

    try {
      const response: AppleApiResponse<InAppPurchase> = await this.callApi(relatedUrl)
      const match = response.data.find(loc => loc.attributes.locale === locale)
      return match
    } catch {
      return null
    }
  }

  static removeAccents(string: string) {
    // See: https://github.com/tyxla/remove-accents/pull/30
    return removeAccents(string).replace(/á/g, 'a').replace(/ạ/g, 'a')
  }

  async updateIapLocalization(
    languageObject: LanguageObject,
    iap: InAppPurchase,
    translations: IapLocalizationFields
  ) {
    const locale = languageObject.appleStoreLocale

    if (!translations || !locale) {
      return this.#logger.log('warn', 'Missing context to localize in-app purchase; aborting', {
        id: iap.attributes.productId,
        locale,
        translations,
      })
    }

    const { name, description } = translations

    this.#logger.log('info', 'Updating in-app purchase localization', {
      id: iap.attributes.productId,
      locale,
      translations,
    })

    // If the name is too long for Apple Store, skip the request altogether since it won’t work
    if (name.length > 30) {
      return this.#logger.log('warn', 'In-app purchase name too long for Apple Store; aborting', {
        id: iap.attributes.productId,
        length: name.length,
        locale,
      })
    }

    // If the desc is too long for Apple Store, skip the request altogether since it won’t work
    if (description.length > 45) {
      return this.#logger.log(
        'warn',
        'In-app purchase description too long for Apple Store; aborting',
        {
          id: iap.attributes.productId,
          length: description.length,
          locale,
        }
      )
    }

    // Unfortunately, Apple Store rejects when the name contains _some_ Unicode characters (they’re
    // very vague about it). CJK works fine, but Vietnamese and French for instance fail on accented
    // characters
    const safeName = AppleStoreManager.removeAccents(name)

    const { related } = iap.relationships.inAppPurchaseLocalizations.links
    const existingIap = await this.getIapLocalization(locale, related)

    if (existingIap) {
      const state = existingIap.attributes?.state

      if (state === 'APPROVED' || state === 'ACTIVE') {
        return this.#logger.log('info', 'In-app purchase already active; aborting', {
          id: existingIap.id,
          locale,
          state,
        })
      }

      const payload = {
        data: {
          attributes: { description, name: safeName },
          id: existingIap.id,
          type: 'inAppPurchaseLocalizations',
        },
      }

      await this.callApi(
        `${this.#apiUrl}/inAppPurchaseLocalizations/${existingIap.id}`,
        'PATCH',
        payload
      )
    } else {
      const payload = {
        data: {
          attributes: { description, locale, name: safeName },
          relationships: {
            inAppPurchaseV2: { data: { id: iap.id, type: 'inAppPurchases' } },
          },
          type: 'inAppPurchaseLocalizations',
        },
      }
      await this.callApi(`${this.#apiUrl}/inAppPurchaseLocalizations`, 'POST', payload)
    }
  }

  findClosestTier(region: string, targetPrice: number): string | null {
    let closestTier: string | null = null
    let smallestDiff = Infinity

    for (const [tierId, regionPrices] of Object.entries(this.priceMatrix)) {
      const price = regionPrices[region]
      if (!price) continue

      const diff = Math.abs(price - targetPrice)
      if (diff < smallestDiff) {
        smallestDiff = diff
        closestTier = tierId
      }
    }

    return closestTier
  }

  decodeIapId(iapId: string): {
    s: string
    t: string
    p: string
  } {
    return JSON.parse(Buffer.from(iapId, 'base64').toString('utf-8'))
  }

  async localizeIapPrices(iapId: string) {
    const iap = await this.callApi<InAppPurchasePrices>(
      `${this.#apiUrl}/inAppPurchasePriceSchedules/${iapId}/manualPrices?filter[territory]=USA&include=inAppPurchasePricePoint`
    )

    const [entry] = iap.data
    const { p: tierId } = this.decodeIapId(entry?.relationships.inAppPurchasePricePoint.data.id)
    const updatedPrices: Record<string, { currency: string; priceMicros: string }> = {}
    const currentPrices: Record<string, { currency: string; priceMicros: string }> = {}

    await Promise.all(
      Object.entries(StoreManager.regionalPriceMap).map(
        async ([region, { iso3, currency: toCurrency, coefficient }]) => {
          const regionalPrice = this.priceMatrix[tierId][iso3]
          const updatedRegionalPrice = regionalPrice * coefficient
          const newTier = this.findClosestTier(iso3, updatedRegionalPrice)
          const payload = {
            data: {
              attributes: { start: '2025-07-25T00:00:00Z' },
              relationships: {
                inAppPurchase: { data: { id: iapId, type: 'inAppPurchases' } },
                priceTier: { data: { id: newTier, type: 'priceTiers' } },
                territory: { data: { id: region, type: 'territories' } },
              },
              type: 'inAppPurchasePrices',
            },
          }

          await this.callApi(`${this.#apiUrl}/inAppPurchasePrices`, 'POST', payload)

          currentPrices[region] = {
            currency: toCurrency,
            priceMicros: String(regionalPrice * 1_000_000),
          }
          updatedPrices[region] = {
            currency: toCurrency,
            priceMicros: String(updatedRegionalPrice * 1_000_000),
          }
        }
      )
    )

    return { currentPrices, updatedPrices }
  }
}
