import type { Client } from 'discord.js'
import {
  default as Crowdin,
  type SourceStringsModel,
} from '@crowdin/crowdin-api-client'
import decompress from 'decompress'
import csvtojson from 'csvtojson'
import fetch from 'node-fetch'

import { CROWDIN_TOKEN } from '../constants/config'
import { logger } from '../utils/logger'
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
  client: Client
  crowdin: Crowdin

  #projectId = 797774

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
      ({ data: { id } }) => id === this.#projectId
    )
    if (!project) throw new Error('Cannot find Crowdin project.')

    return project.data
  }

  async getProjectProgress() {
    this.#log('info', 'Getting project progress')

    const { data: projectProgress } =
      await this.crowdin.translationStatusApi.getProjectProgress(
        this.#projectId
      )

    return projectProgress
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
    { withEnglish = true } = {}
  ) {
    return Promise.all(this.getLanguages({ withEnglish }).map(handler))
  }
}

export const initCrowdinManager = (client: Client) => {
  const manager = new CrowdinManager(client)
  return manager
}
