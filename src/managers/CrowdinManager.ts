import type { Client } from 'discord.js'
import {
  default as Crowdin,
  type SourceStringsModel,
  type LanguagesModel,
} from '@crowdin/crowdin-api-client'
import decompress from 'decompress'
import csvtojson from 'csvtojson'
import fetch from 'node-fetch'
import pMap from 'p-map'

import { CROWDIN_TOKEN } from '../constants/config'
import { logger } from '../utils/logger'
import { pool } from '../utils/pg'
import type { LocalizationItem } from './LocalizationManager'
import {
  LANGUAGE_OBJECTS,
  type CrowdinCode,
  type LanguageObject,
} from '../constants/i18n'

export type {
  LanguagesModel,
  ResponseObject,
  StringTranslationsModel,
  TranslationStatusModel,
} from '@crowdin/crowdin-api-client'

type StringId = SourceStringsModel.String['id']

export type CrowdinItem = Record<CrowdinCode, string> & {
  Key: string
  Context?: string
}

export class CrowdinManager {
  #projectId = 797774
  #projectIdentifier = 'eternal-hero'
  client: Client
  crowdin: Crowdin

  #cachedTranslations: LocalizationItem[] | null = null
  #lastFetchedAt = 0
  #cacheTTL = 15 * 60 * 1000 // 15 minutes

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('CrowdinManager', this.#severityThreshold)

  constructor(client: Client) {
    this.#log('info', 'Instantiating manager')
    // @ts-expect-error
    this.crowdin = new Crowdin.default({ token: CROWDIN_TOKEN ?? '' })
    this.client = client
  }

  getLanguages(options: { withEnglish: boolean }) {
    return LANGUAGE_OBJECTS.filter(object => {
      if (object.isOnCrowdin) return true
      if (object.crowdinCode === 'en' && options.withEnglish) return true
      return false
    })
  }

  async getProject() {
    this.#log('info', 'Resolving project')
    const projects = await this.crowdin.projectsGroupsApi.listProjects()
    const project = projects.data.find(
      project => project.data.identifier === this.#projectIdentifier
    )
    if (!project) throw new Error('Cannot find Crowdin project.')

    return project.data
  }

  async cacheCrowdinStrings(strings: SourceStringsModel.String[]) {
    this.#log('info', 'Caching strings')

    const values: string[] = []
    const params: (string | number | SourceStringsModel.PluralText)[] = []

    strings.forEach((string, i) => {
      const offset = i * 3
      values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`)
      params.push(string.identifier, string.id, string.text)
    })

    if (params.length > 0) {
      await pool.query(
        `
        INSERT INTO crowdin_strings (identifier, string_id, text)
        VALUES ${values.join(',')}
        ON CONFLICT (identifier) DO NOTHING
        `,
        params
      )
    }
  }

  async getProjectProgress() {
    this.#log('info', 'Getting project progress')

    const { data: projectProgress } =
      await this.crowdin.translationStatusApi.getProjectProgress(
        this.#projectId
      )

    return projectProgress
  }

  async getLanguageObject(crowdinCode: CrowdinCode) {
    this.#log('info', 'Getting language object')

    const { targetLanguages: languageObjects } = await this.getProject()

    return languageObjects.find(
      languageObject => languageObject.id === crowdinCode
    )
  }

  async getStringTranslationsForAllLanguages(stringId: StringId) {
    this.#log('info', 'Getting all translations from string', { stringId })

    const { targetLanguages: languages } = await this.getProject()

    return this.getStringTranslations(stringId, languages)
  }

  async getStringTranslations(
    stringId: StringId,
    languages: LanguagesModel.Language[]
  ) {
    this.#log('info', 'Getting string translations from string', { stringId })

    return Promise.all(
      languages.map(language =>
        this.getProjectStringTranslation(stringId, language)
      )
    )
  }

  async getStringItem(identifier: string) {
    this.#log('info', 'Getting string item', { identifier })

    const { rows } = await pool.query(
      'SELECT string_id, text FROM crowdin_strings WHERE identifier = $1',
      [identifier]
    )

    const result: { string_id: StringId; text: string } | undefined = rows[0]

    if (!result) {
      const strings = await this.getProjectStrings()
      await this.cacheCrowdinStrings(strings)

      return strings.find(string => string.identifier === identifier)
    }

    return { id: result.string_id, text: result.text }
  }

  async getProjectStringTranslation(
    stringId: StringId,
    language: LanguagesModel.Language
  ) {
    this.#log('info', 'Getting string translation', { stringId, language })

    const outcome =
      await this.crowdin.stringTranslationsApi.listStringTranslations(
        this.#projectId,
        stringId,
        language.id
      )

    return { language, translation: outcome.data[0] }
  }

  async getProjectStrings() {
    this.#log('info', 'Getting project strings')

    const allStrings: SourceStringsModel.String[] = []
    let offset = 0
    const limit = 500 // Max limit per request

    while (true) {
      const { data } = await this.crowdin.sourceStringsApi.listProjectStrings(
        this.#projectId,
        { limit, offset }
      )

      allStrings.push(...data.map(item => item.data))
      if (data.length < limit) break
      offset += limit
    }

    return allStrings
  }

  async buildProject() {
    this.#log('info', 'Building project')

    const {
      data: { id: buildId },
    } = await this.crowdin.translationsApi.buildProject(this.#projectId)

    return buildId
  }

  async waitForBuild(buildId: number) {
    this.#log('info', 'Waiting for build to finish', { buildId })

    let status = 'inProgress'
    while (status === 'inProgress') {
      const { data } = await this.crowdin.translationsApi.checkBuildStatus(
        this.#projectId,
        buildId
      )
      status = data.status
      if (status === 'failed') throw new Error('Crowdin build failed')
      if (status !== 'finished') await new Promise(res => setTimeout(res, 1000))
    }
  }

  async downloadBuildArtefact(buildId: number) {
    this.#log('info', 'Downloading build artefact', { buildId })

    // Retrieve the URL to download the zip file with all CSV translation files
    const { data } = await this.crowdin.translationsApi.downloadTranslations(
      this.#projectId,
      buildId
    )

    // Download the archive
    const response = await fetch(data.url)
    if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`)
    const zipBuffer = await response.buffer()

    // Unzip the archive
    const files = await decompress(zipBuffer)

    // Convert each CSV file into JSON
    const jsons: CrowdinItem[][] = []
    for (const file of files) {
      const content = file.data.toString('utf-8')
      const json = await csvtojson().fromString(content)
      jsons.push(json)
    }

    // Flatten all JSON structures into a single array, and reshape the entries
    // for convenience
    return jsons
      .reduce((acc, array) => acc.concat(array), [])
      .map(
        ({ Key: key, Context, ...translations }) =>
          ({ key, translations }) as LocalizationItem
      )
  }

  async fetchAllProjectTranslations(forceRefresh = false) {
    this.#log('info', 'Fetching all project translations')

    const now = Date.now()

    if (
      !forceRefresh &&
      this.#cachedTranslations &&
      now - this.#lastFetchedAt < this.#cacheTTL
    ) {
      this.#log('info', 'Reading all project translations from cache')
      return this.#cachedTranslations
    }

    const buildId = await this.buildProject()
    await this.waitForBuild(buildId)
    const data = await this.downloadBuildArtefact(buildId)

    this.#cachedTranslations = data
    this.#lastFetchedAt = now

    return data
  }

  onCrowdinLanguages(
    handler: (
      item: LanguageObject,
      index: number,
      array: LanguageObject[]
    ) => Promise<void>,
    { concurrency = 10, withEnglish = true } = {}
  ) {
    const languageObjects = this.getLanguages({ withEnglish })

    return pMap(
      languageObjects.entries(),
      ([index, languageObject]) =>
        handler(languageObject, index, languageObjects),
      { concurrency }
    )
  }
}

export const initCrowdinManager = (client: Client) => {
  const manager = new CrowdinManager(client)
  return manager
}
