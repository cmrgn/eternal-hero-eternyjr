import jwt from 'jsonwebtoken'

import { logger } from '../utils/logger'
import type { LanguageObject, Locale } from '../constants/i18n'
import type { IapLocalizationFields } from './StoreManager'

type LocalizedIap = {
  id: string
  slug: string
} & IapLocalizationFields

type RelationshipLink = {
  links: { self: string; related: string; next?: string }
}
export type InAppPurchase = RelationshipLink & {
  type: 'inAppPurchases'
  id: string
  attributes: { name: string; productId: string }
  relationships: { inAppPurchaseLocalizations: RelationshipLink }
}

type AttributesWithLocale = { attributes: { locale: string } }

export class AppleStoreManager {
  #jwt: string

  #apiUrl = 'https://api.appstoreconnect.apple.com/v1'
  #appId = '6503089848'

  #cachedIAPs: InAppPurchase[] | null = null
  #lastFetchedAtIAPs = 0
  #cacheTTL = 15 * 60 * 1000 // 15 minutes

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('AppleStoreManager', this.#severityThreshold)

  constructor() {
    this.#log('info', 'Instantiating manager')
    this.#jwt = this.generateJwt()
  }

  get headers() {
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
    const expireIn = now + 299 // 300 === 5 minutes
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

  async callApi(path: string, method = 'GET', payload?: unknown) {
    this.#log('info', 'Calling Apple Store API', {
      path,
      method,
      payload: JSON.stringify(payload),
    })

    const response = await fetch(path, {
      method,
      body: JSON.stringify(payload),
      headers: this.headers,
    })

    return response.json()
  }

  async fetchAllIaps() {
    this.#log('info', 'Fetching all IAPs')

    const getAllPages = async (initialUrl: string) => {
      let results: InAppPurchase[] = []
      let nextUrl: string | null = initialUrl

      while (nextUrl) {
        type Response = RelationshipLink & { data: InAppPurchase[] }
        const response = (await this.callApi(nextUrl)) as Response
        results = results.concat(...response.data)
        nextUrl = response.links?.next ?? null
      }

      return results
    }

    const now = Date.now()
    if (this.#cachedIAPs && now - this.#lastFetchedAtIAPs < this.#cacheTTL) {
      return this.#cachedIAPs
    }

    const data = await getAllPages(
      `${this.#apiUrl}/apps/${this.#appId}/inAppPurchasesV2`
    )

    this.#cachedIAPs = data
    this.#lastFetchedAtIAPs = now

    return data
  }

  async getIapInfo(data: InAppPurchase): Promise<LocalizedIap> {
    this.#log('info', 'Getting IAP info', {
      id: data.id,
      slug: data.attributes.productId,
    })

    const relatedUrl =
      data.relationships.inAppPurchaseLocalizations.links.related
    const response = await this.callApi(relatedUrl)
    const en = response.data.find(
      (loc: AttributesWithLocale) => loc.attributes.locale === 'en-US'
    )

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
      const response = await this.callApi(relatedUrl)
      const match = response.data.find(
        (loc: AttributesWithLocale) => loc.attributes.locale === locale
      )
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

    this.#log('info', 'Updating IAP localization', {
      locale,
      id: iap.attributes.productId,
      translations,
    })

    const relatedUrl =
      iap.relationships.inAppPurchaseLocalizations.links.related
    const existingId = await this.getLocalizationId(locale, relatedUrl)
    const payload = {
      data: {
        type: 'inAppPurchaseLocalizations',
        attributes: {
          locale,
          name: translations.name ?? undefined,
          description: translations.description ?? undefined,
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

    this.#log('info', 'Successfully updated IAP localization', {
      locale,
      id: iap.attributes.productId,
      translations,
    })
  }
}
