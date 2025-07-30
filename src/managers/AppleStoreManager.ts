import fs from 'node:fs/promises'
import jwt from 'jsonwebtoken'
import removeAccents from 'remove-accents'
import type { LanguageObject } from '../constants/i18n'
import { request } from '../utils/request'
import { LogManager, type Severity } from './LogManager'
import { StoreManager } from './StoreManager'

export type IapLocalizationFields = { name: string; description: string }

export type InAppPurchase = {
  links: { self: string; related: string; next?: string }
  type: 'inAppPurchases'
  id: string
  attributes: {
    state?: 'APPROVED' | 'ACTIVE'
    name?: string
    description?: string
    productId: string
    locale: string
  }
  relationships: {
    inAppPurchaseLocalizations: { links: { self: string; related: string; next?: string } }
  }
}

type ManualPrice = { id: string; type: 'inAppPurchasePrices' }

type InAppPurchasePrice = {
  attributes: { endDate: null; startDate: null | string; manual?: boolean }
  id: string
  relationships: {
    inAppPurchasePricePoint: { data: { id: string; type: 'inAppPurchasePricePoints' } }
  }
  type: 'inAppPurchasePrices'
}

type InAppPurchasePricePoint = {
  type: 'inAppPurchasePricePoints'
  id: string
  attributes: { customerPrice: string }
  relationships: {
    territory: { data: { type: 'territories'; id: string } }
    equalizations: { links: { self: string; related: string } }
  }
  links: { self: string }
}

type InAppPurchasePricesWithPricePoints = {
  data: InAppPurchasePrice[]
  included: InAppPurchasePricePoint[]
  links: { self: string }
  meta: { paging: { total: number }; limit: number }
}

export class AppleStoreManager {
  #jwt: string | null = null
  #jwtIssuedAt = 0
  #jwtTtl = 5 * 60 // 5 minutes

  #apiUrl = 'https://api.appstoreconnect.apple.com/v1'
  #appId = '6503089848'

  #tierMatrix: Record<string, Record<string, number>> | null = null

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
    this.loadTierMatrix()
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

  async loadTierMatrix() {
    const content = await fs.readFile('./apple-tier-matrix.json', 'utf-8')
    const data = JSON.parse(content)
    this.#tierMatrix = data
  }

  get tierMatrix() {
    if (!this.#tierMatrix) {
      throw new Error('Attempting to access price matrix before it gets initialized.')
    }

    return this.#tierMatrix
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

  callApi<T>(path: string, method = 'GET', payload?: unknown): Promise<T> {
    const body = JSON.stringify(payload)
    const context = { body, method, path }
    const headers = this.headers

    this.#logger.log('info', 'Calling Apple Store API', context)
    return request(this.#logger, path, { body, headers, method })
  }

  async callApiWithPagination<T>(initialUrl: string) {
    let results: T[] = []
    let nextUrl: string | null = initialUrl

    while (nextUrl) {
      const response: { data: T[]; links?: { next: string } } = await this.callApi(nextUrl)
      results = results.concat(...response.data)
      nextUrl = response.links?.next ?? null
    }

    return results
  }

  async getAllIaps() {
    this.#logger.log('info', 'Fetching all in-app purchases')

    const now = Date.now()
    if (this.#cache.data && now - this.#cache.lastFetchedAt < this.#cache.ttl) {
      return this.#cache.data
    }

    const data = await this.callApiWithPagination<InAppPurchase>(
      `${this.#apiUrl}/apps/${this.#appId}/inAppPurchasesV2`
    )

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
      const response: { data: InAppPurchase[] } = await this.callApi(relatedUrl)
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

  findClosestPricePoint(
    targetPrice: number,
    pricePoints: InAppPurchasePricePoint[]
  ): InAppPurchasePricePoint | null {
    let closestPricePoint: InAppPurchasePricePoint | null = null
    let smallestDiff = Infinity

    for (const pricePoint of pricePoints) {
      const price = +pricePoint.attributes.customerPrice
      if (!price) continue

      const diff = Math.abs(price - targetPrice)
      if (diff < smallestDiff) {
        smallestDiff = diff
        closestPricePoint = pricePoint
      }
    }

    return closestPricePoint
  }

  getIapIdDecoder() {
    const cache = new Map()

    return (
      iapId: string
    ): {
      s: string // price point internal Apple ID
      t: string // ISO-3 region
      p: string // price point ID
    } => {
      if (cache.has(iapId)) return cache.get(iapId)
      const decoded = Buffer.from(iapId, 'base64').toString('utf-8')
      const parsed = JSON.parse(decoded)
      cache.set(iapId, parsed)
      return parsed
    }
  }

  async localizeIapPrices(iapId: string) {
    const baseTerritory = 'USA'
    const territories = Object.values(StoreManager.regionalPriceMap)
      .map(config => config.iso3)
      .join(',')

    // These objects are solely maintained for return and logging perspectives, matching the outcome
    // of the Google API for simplicity. They have no bearing on the actual logic.
    const updatedPrices: Record<string, { currency: string; priceMicros: string }> = {}
    const currentPrices: Record<string, { currency: string; priceMicros: string }> = {}

    // The first step is to retrieve the current price in the USA region which is the default region
    // including its price point (a price point is also known as a price *tier*). Note that there
    // doesn’t appear to be documentation for that endpoint, which is very concerning.
    const iapPriceWithPricePoints: InAppPurchasePricesWithPricePoints = await this.callApi(
      `${this.#apiUrl}/inAppPurchasePriceSchedules/${iapId}/manualPrices?filter[territory]=${baseTerritory}&include=inAppPurchasePricePoint`
    )

    // Retrieve the IAP price point ID. It’s a base64 encoded JSON blob with 3 keys:
    // - s: the current IAP ID (same as the argument to this method).
    // - t: the region expressed as an ISO 3166-1 alpha-3 (e.g. USA).
    // - p: the ID of the current price point (i.e. price tier).
    const iapppId = iapPriceWithPricePoints.data[0].relationships.inAppPurchasePricePoint.data.id

    // Then, we need to retrieve the price points for *all* the regions in the world. Technically,
    // we only need the 2 dozens regions we want to localize prices for, but it’s easier to just get
    // them all. Note that:
    // - We specify the maximum limit for the endpoint (although there are only ~175 regions).
    // - We include the territory data to have access to region directly, otherwise we would have to
    //   parse it from the encoded ID like we’ve done for the USA one.
    // - We specify the fields we need to ignore the rest, for simplicity perspective.
    // - That endpoint is *not* the same as `/relationships/equalizations`. This is the one we use:
    //   https://developer.apple.com/documentation/appstoreconnectapi/get-v1-inapppurchasepricepoints-_id_-equalizations
    const nextUrl = iapPriceWithPricePoints.included[0].relationships.equalizations.links.related
    const { data: inAppPurchasePricePoints }: { data: InAppPurchasePricePoint[] } =
      await this.callApi(
        nextUrl +
          `?include=territory&limit=8000&fields[inAppPurchasePricePoints]=customerPrice,territory,equalizations&filter[territory]=${territories}`
      )

    // The IDs are weird but it’s not a mistake. Each entry in the array of manual prices is mapped
    // to a corresponding entry in the array of IAP prices by a unique ID. I assume this ID could be
    // anything at all, but the UI-flow on the Apple website uses strings like `${newprice-0}`, so I
    // thought I’d use a similar thing, only with region codes instead of indiceS.
    const baseTerritoryIappId = `\${newprice-${baseTerritory}}`

    // The first entry in the collection of manual prices is the current price tier in the default
    // region, which is USA. I’m not super sure why we have to send it since we don’t modify it, but
    // when setting up a regional price via the UI, Apple sends it like this so here goes.
    const iapDefinitions: ManualPrice[] = [{ id: baseTerritoryIappId, type: 'inAppPurchasePrices' }]
    const iapPrices: InAppPurchasePrice[] = [
      {
        attributes: { endDate: null, startDate: null },
        id: baseTerritoryIappId,
        relationships: {
          inAppPurchasePricePoint: { data: { id: iapppId, type: 'inAppPurchasePricePoints' } },
        },
        type: 'inAppPurchasePrices',
      },
    ]

    // To avoid having to query the regional price points for each region individually, we query all
    // of them upfront, and then filter the relevant one for each region. This reduces the amount of
    // HTTP requests against the Apple API and speeds things up a bit.
    const allPricePoints: InAppPurchasePricePoint[] = await this.callApiWithPagination(
      `https://api.appstoreconnect.apple.com/v2/inAppPurchases/${iapId}/pricePoints?limit=8000&fields[inAppPurchasePricePoints]=customerPrice,territory&fields[territories]=currency&filter[territory]=${territories}`
    )
    const decode = this.getIapIdDecoder()

    await Promise.all(
      Object.entries(StoreManager.regionalPriceMap).map(
        async ([region, { iso3, currency: toCurrency, coefficient }]) => {
          // Retrieve the IAP price point for the current region
          const inAppPurchasePricePoint = inAppPurchasePricePoints.find(
            iappp => iappp.relationships.territory.data.id === iso3
          )

          // If we couldn’t find one, skip that region. Note, this shouldn’t happen unless we use
          // ISO-3 region codes which Apple do not handle.
          if (!inAppPurchasePricePoint) {
            return this.#logger.log(
              'warn',
              'Could not retrieve regional IAP price point; skipping.',
              { iapId, iso3 }
            )
          }

          // Apply the coefficient to the current regional price to get the target price. However,
          // Apple does not allow setting up a price yourself — you need to set a price point (i.e.
          // price tier) instead.
          const currentPrice = +inAppPurchasePricePoint.attributes.customerPrice
          const targetPrice = currentPrice * coefficient

          // This code was commented because we instead fetch all price points across all relevant
          // regions for the current IAP, and then just filter for the current region. This comment
          // and code is left here for posterity:
          // > Then, retrieve all the possible price points (i.e. price tiers) for the current region.
          // > - This endpoint only exists on the v2 API.
          // > - We specify the maximum limit for safety, but there should be “only” ~700 price points
          // >   for a given region — varies depending on the region.
          // > - We include only the customer price as a field, since that and the ID is all we need.
          // > See: https://developer.apple.com/documentation/appstoreconnectapi/get-v2-inapppurchases-_id_-pricepoints
          // const { data: regionalPricePoints }: { data: InAppPurchasePricePoint[] } =
          //   await this.callApi(`https://api.appstoreconnect.apple.com/v2/inAppPurchases/${iapId}/pricePoints?limit=8000&filter[territory]=${iso3}&fields[inAppPurchasePricePoints]=customerPrice`
          // )

          // Unfortunately, the price points do not include the territory name as ISO-3 code, so we
          // need to retrieve it from the base64 encoded ID where `t` is the region. It’s not great
          // because we need to JSON parse + base64 decode thousands of strings, but it is what it
          // is.
          const regionalPricePoints = allPricePoints.filter(
            pricePoint => decode(pricePoint.id).t === iso3
          )

          // Then, we look for the price point that is the closest to our target price. It can be
          // slightly more or slightly less expensive that our intended target price — that’s what
          // happens with price tiers. It’s okay.
          const newPricePoint = this.findClosestPricePoint(targetPrice, regionalPricePoints)

          // If we cannot find a price point for some reason, then do not change the price for that
          // region. This can happen for very cheap items that are already on the lowest price point
          // for instance.
          if (!newPricePoint) {
            return this.#logger.log('warn', 'Could not find a new price point; skipping.', {
              iapId,
              region,
            })
          }

          const startDate = '2025-08-01'
          const iappId = `\${newprice-${iso3}}`
          const newIapPricePoint = {
            data: { id: newPricePoint.id, type: 'inAppPurchasePricePoints' as const },
          }

          iapDefinitions.push({ id: iappId, type: 'inAppPurchasePrices' })
          iapPrices.push({
            attributes: { endDate: null, startDate },
            id: iappId,
            relationships: { inAppPurchasePricePoint: newIapPricePoint },
            type: 'inAppPurchasePrices',
          })

          currentPrices[region] = {
            currency: toCurrency,
            priceMicros: String(currentPrice * 1_000_000),
          }
          updatedPrices[region] = {
            currency: toCurrency,
            priceMicros: String(+newPricePoint.attributes.customerPrice * 1_000_000),
          }
        }
      )
    )

    await this.callApi(`${this.#apiUrl}/inAppPurchasePriceSchedules`, 'POST', {
      data: {
        relationships: {
          baseTerritory: { data: { id: baseTerritory, type: 'territories' } },
          inAppPurchase: { data: { id: iapId, type: 'inAppPurchases' } },
          manualPrices: { data: iapDefinitions },
        },
        type: 'inAppPurchasePriceSchedules',
      },
      included: iapPrices,
    })

    return { currentPrices, updatedPrices }
  }
}
