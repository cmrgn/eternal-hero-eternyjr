import { default as Crowdin } from '@crowdin/crowdin-api-client'
import csvtojson from 'csvtojson'
import decompress, { type File } from 'decompress'
import type { Client } from 'discord.js'
import fetch from 'node-fetch'
import { type CrowdinCode, LANGUAGE_OBJECTS, type LanguageObject } from '../constants/i18n'
import { logger } from '../utils/logger'
import { withRetry } from '../utils/withRetry'
import type { LocalizationItem } from './LocalizationManager'

export type {
  LanguagesModel,
  ResponseObject,
  StringTranslationsModel,
  TranslationStatusModel,
} from '@crowdin/crowdin-api-client'

export type CrowdinItem = Record<CrowdinCode, string> & {
  Key: string
  Context?: string
}

export class CrowdinManager {
  #client: Client

  #crowdin: Crowdin
  #gameProjectId = 797774
  #storeProjectId = 808178

  #cachedFilesMap: Map<number, File[]> = new Map()
  #lastFetchedAtMap: Map<number, number> = new Map()
  #cacheTTL = 15 * 60 * 1000 // 15 minutes

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('CrowdinManager', this.#severityThreshold)

  constructor(client: Client) {
    this.#log('info', 'Instantiating manager')

    if (!process.env.CROWDIN_TOKEN) {
      throw new Error('Missing environment variable CROWDIN_TOKEN; aborting.')
    }

    // @ts-expect-error
    this.#crowdin = new Crowdin.default({ token: process.env.CROWDIN_TOKEN })
    this.#client = client
  }

  getLanguages(options: { withEnglish: boolean }) {
    return LANGUAGE_OBJECTS.filter(object => {
      if (object.isOnCrowdin) return true
      if (object.crowdinCode === 'en' && options.withEnglish) return true
      return false
    })
  }

  async getProjectProgress(projectId = this.#gameProjectId) {
    const { data: projectProgress } = await withRetry(attempt => {
      this.#log('info', 'Getting project progress', { attempt })
      return this.#crowdin.translationStatusApi.getProjectProgress(projectId)
    })

    return projectProgress
  }

  async buildProject(projectId: number) {
    this.#log('info', 'Building project', { projectId })

    try {
      const {
        data: { id: buildId },
      } = await withRetry(attempt => {
        this.#log('info', 'Building project', { attempt, projectId })
        return this.#crowdin.translationsApi.buildProject(projectId)
      })
      return buildId
    } catch {
      const builds = await withRetry(attempt => {
        this.#log('warn', 'Building project failed, falling back to latest build', {
          attempt,
          projectId,
        })
        return this.#crowdin.translationsApi.listProjectBuilds(projectId, {
          limit: 1,
        })
      })

      return builds.data[0].data.id
    }
  }

  async waitForBuild(buildId: number, projectId: number) {
    this.#log('info', 'Waiting for build to finish', { buildId, projectId })

    let status = 'inProgress'
    while (status === 'inProgress') {
      const { data } = await withRetry(attempt => {
        this.#log('info', 'Waiting for build to finish', {
          attempt,
          buildId,
          projectId,
        })
        return this.#crowdin.translationsApi.checkBuildStatus(projectId, buildId)
      })
      status = data.status
      if (status === 'failed') throw new Error('Crowdin build failed')
      if (status !== 'finished') await new Promise(res => setTimeout(res, 2000))
    }
  }

  async downloadBuildArtefact(buildId: number, projectId: number) {
    return withRetry(async attempt => {
      this.#log('info', 'Downloading build artefact', {
        attempt,
        buildId,
        projectId,
      })

      // Retrieve the URL to download the zip file with all CSV translation files
      const { data } = await this.#crowdin.translationsApi.downloadTranslations(projectId, buildId)

      // Download the archive
      const response = await withRetry(() => fetch(data.url))
      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`)
      const zipBuffer = await response.buffer()

      // Unzip the archive
      return decompress(zipBuffer)
    })
  }

  async parseTranslationFiles(files: File[]) {
    const jsons: CrowdinItem[][] = []

    for (const file of files) {
      const content = file.data.toString('utf-8')
      try {
        const json = await csvtojson().fromString(content)
        jsons.push(json)
      } catch (error) {
        this.#log('warn', 'Failed to parse CSV', { error, path: file.path })
      }
    }

    return jsons
  }

  async extractTranslationsFromFiles(files: File[]) {
    // Convert each CSV file into JSON
    const jsons = await this.parseTranslationFiles(files)

    // Flatten all JSON structures into a single array, and reshape the entries for convenience
    return jsons
      .reduce((acc, array) => acc.concat(array), [])
      .map(
        ({ Key, Context, ...translations }): LocalizationItem => ({
          key: Key,
          translations,
        })
      )
  }

  async fetchAllProjectTranslations(forceRefresh = false, projectId = this.#gameProjectId) {
    this.#log('info', 'Fetching all project files', {
      forceRefresh,
      projectId,
    })

    const now = Date.now()
    const cachedFiles = this.#cachedFilesMap.get(projectId)
    const lastFetchedAt = this.#lastFetchedAtMap.get(projectId) ?? 0

    if (!forceRefresh && cachedFiles && now - lastFetchedAt < this.#cacheTTL) {
      this.#log('info', 'Reading all project files from cache', {
        age: now - lastFetchedAt,
        projectId,
        ttl: this.#cacheTTL,
      })
      return cachedFiles
    }

    const buildId = await this.buildProject(projectId)
    await this.waitForBuild(buildId, projectId)
    const files = await this.downloadBuildArtefact(buildId, projectId)

    this.#cachedFilesMap.set(projectId, files)
    this.#lastFetchedAtMap.set(projectId, now)

    return files
  }

  async fetchStoreTranslations(forceRefresh = false) {
    this.#log('info', 'Fetching store translations', { forceRefresh })

    const files = await this.fetchAllProjectTranslations(forceRefresh, this.#storeProjectId)

    return files.filter(file => file.path.includes('iap-store'))
  }

  onCrowdinLanguages(
    handler: (item: LanguageObject, index: number, array: LanguageObject[]) => Promise<void>,
    { withEnglish = true } = {}
  ) {
    return Promise.all(this.getLanguages({ withEnglish }).map(handler))
  }
}
