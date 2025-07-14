import jwt from 'jsonwebtoken'

import { logger } from '../utils/logger'
import type { LanguageObject, Locale } from '../constants/i18n'
import { withRetry } from '../utils/withRetry'
import { fetchJson } from '../utils/fetchJson'

export type IapLocalizationFields = { name: string; description: string }

type LocalizedIap = IapLocalizationFields & {
  id: string
  slug: string
}

type RelationshipLink = {
  links: { self: string; related: string; next?: string }
}
export type InAppPurchase = RelationshipLink & {
  type: 'inAppPurchases'
  id: string
  attributes: {
    name?: string
    description?: string
    productId: string
    locale: string
  }
  relationships: { inAppPurchaseLocalizations: RelationshipLink }
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

  #cachedIaps: InAppPurchase[] | null = null
  #lastFetchedAtIaps = 0
  #cacheTTL = 15 * 60 * 1000 // 15 minutes

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('AppleStoreManager', this.#severityThreshold)

  constructor() {
    this.#log('info', 'Instantiating manager')
    this.#jwt = this.generateJwt()
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

  generateJwt() {
    if (!process.env.APPLE_STORE_ISSUER_ID) {
      throw new Error(
        'Missing environment variable APPLE_STORE_ISSUER_ID; aborting.'
      )
    }

    if (!process.env.APPLE_STORE_KEY_ID) {
      throw new Error(
        'Missing environment variable APPLE_STORE_KEY_ID; aborting.'
      )
    }

    if (!process.env.APPLE_STORE_PRIVATE_KEY) {
      throw new Error(
        'Missing environment variable APPLE_STORE_PRIVATE_KEY; aborting.'
      )
    }

    const pkey = process.env.APPLE_STORE_PRIVATE_KEY.replace(/\\n/g, '\n')
    const issuer = process.env.APPLE_STORE_ISSUER_ID
    const kid = process.env.APPLE_STORE_KEY_ID

    const now = Math.round(new Date().getTime() / 1000)
    const expireIn = now + this.#jwtTtl - 1
    const token = jwt.sign(
      {
        iss: issuer,
        exp: expireIn,
        aud: 'appstoreconnect-v1',
      },
      pkey,
      {
        algorithm: 'ES256',
        header: { alg: 'ES256', kid, typ: 'JWT' },
      }
    )

    return token
  }

  callApi<T>(
    path: string,
    method = 'GET',
    payload?: unknown
  ): Promise<AppleApiResponse<T>> {
    return withRetry(attempt => {
      const body = JSON.stringify(payload)
      const context = { path, method, body, attempt }
      const headers = this.headers

      this.#log('info', 'Calling Apple Store API', context)

      return fetchJson(path, { method, body, headers })
    })
  }

  async fetchAllIaps() {
    this.#log('info', 'Fetching all in-app purchases')

    const getAllPages = async (initialUrl: string) => {
      let results: InAppPurchase[] = []
      let nextUrl: string | null = initialUrl

      while (nextUrl) {
        const response: AppleApiResponse<InAppPurchase> =
          await this.callApi(nextUrl)
        results = results.concat(...response.data)
        nextUrl = response.links?.next ?? null
      }

      return results
    }

    const now = Date.now()
    if (this.#cachedIaps && now - this.#lastFetchedAtIaps < this.#cacheTTL) {
      return this.#cachedIaps
    }

    const data = await getAllPages(
      `${this.#apiUrl}/apps/${this.#appId}/inAppPurchasesV2`
    )

    if (data.length > 0) {
      this.#cachedIaps = data
      this.#lastFetchedAtIaps = now
    }

    return data
  }

  async getIapInfo(data: InAppPurchase): Promise<LocalizedIap> {
    this.#log('info', 'Getting in-app purchase info', {
      id: data.id,
      slug: data.attributes.productId,
    })

    const { related } = data.relationships.inAppPurchaseLocalizations.links
    const response: AppleApiResponse<InAppPurchase> =
      await this.callApi(related)
    const en = response.data.find(loc => loc.attributes.locale === 'en-US')

    return {
      id: data.id,
      slug: data.attributes.productId,
      name: en?.attributes.name ?? '',
      description: en?.attributes.description ?? '',
    }
  }

  async getLocalizationId(locale: Locale, relatedUrl: string) {
    this.#log('info', 'Getting localization ID', {
      locale,
      relatedUrl,
    })

    try {
      const response: AppleApiResponse<InAppPurchase> =
        await this.callApi(relatedUrl)
      const match = response.data.find(loc => loc.attributes.locale === locale)
      return match?.id ?? null
    } catch {
      return null
    }
  }

  async updateIapLocalization(
    languageObject: LanguageObject,
    iap: InAppPurchase,
    translations: IapLocalizationFields
  ) {
    const { locale } = languageObject

    if (!translations) return

    this.#log('info', 'Updating in-app purchase localization', {
      locale,
      id: iap.attributes.productId,
      translations,
    })

    const { related } = iap.relationships.inAppPurchaseLocalizations.links
    const existingId = await this.getLocalizationId(locale, related)
    const payload = {
      data: {
        type: 'inAppPurchaseLocalizations',
        attributes: {
          locale,
          name: translations.name,
          description: translations.description,
        },
        relationships: {
          inAppPurchaseV2: { data: { type: 'inAppPurchases', id: iap.id } },
        },
      },
    }

    if (existingId) {
      await this.callApi(
        `${this.#apiUrl}/inAppPurchaseLocalizations/${existingId}`,
        'PATCH',
        payload
      )
    } else {
      await this.callApi(
        `${this.#apiUrl}/inAppPurchaseLocalizations`,
        'POST',
        payload
      )
    }
  }
}
