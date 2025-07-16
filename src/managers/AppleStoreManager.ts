import jwt from 'jsonwebtoken'
import removeAccents from 'remove-accents'
import type { LanguageObject } from '../constants/i18n'
import { fetchJson } from '../utils/fetchJson'
import { type LoggerSeverity, logger } from '../utils/logger'
import { withRetry } from '../utils/withRetry'

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
    state?: 'APPROVED' | 'ACTIVE'
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
  #log = logger.log('AppleStoreManager', this.#severityThreshold)

  constructor(severity: LoggerSeverity = 'info') {
    this.#severityThreshold = logger.LOG_SEVERITIES.indexOf(severity)
    this.#log('debug', 'Instantiating manager')
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
    return withRetry(attempt => {
      const body = JSON.stringify(payload)
      const context = { attempt, body, method, path }
      const headers = this.headers

      this.#log('info', 'Calling Apple Store API', context)

      return fetchJson(path, { body, headers, method })
    })
  }

  async getAllIaps() {
    this.#log('info', 'Fetching all in-app purchases')

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

  async getIapInfo(data: InAppPurchase): Promise<LocalizedIap> {
    this.#log('info', 'Getting in-app purchase info', {
      id: data.id,
      slug: data.attributes.productId,
    })

    const { related } = data.relationships.inAppPurchaseLocalizations.links
    const response: AppleApiResponse<InAppPurchase> = await this.callApi(related)
    const en = response.data.find(loc => loc.attributes.locale === 'en-US')

    return {
      description: en?.attributes.description ?? '',
      id: data.id,
      name: en?.attributes.name ?? '',
      slug: data.attributes.productId,
    }
  }

  async getIapLocalization(locale: string, relatedUrl: string) {
    this.#log('info', 'Getting in-app purchase localization', {
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
      return this.#log('warn', 'Missing context to localize in-app purchase; aborting', {
        id: iap.attributes.productId,
        locale,
        translations,
      })
    }

    const { name, description } = translations

    this.#log('info', 'Updating in-app purchase localization', {
      id: iap.attributes.productId,
      locale,
      translations,
    })

    // If the name is too long for Apple Store, skip the request altogether since it won’t work
    if (name.length > 30) {
      return this.#log('warn', 'In-app purchase name too long for Apple Store; aborting', {
        id: iap.attributes.productId,
        length: name.length,
        locale,
      })
    }

    // If the desc is too long for Apple Store, skip the request altogether since it won’t work
    if (description.length > 45) {
      return this.#log('warn', 'In-app purchase description too long for Apple Store; aborting', {
        id: iap.attributes.productId,
        length: description.length,
        locale,
      })
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
        return this.#log('info', 'In-app purchase already active; aborting', {
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
}
