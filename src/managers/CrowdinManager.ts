import { default as Crowdin } from '@crowdin/crowdin-api-client'
import csvtojson from 'csvtojson'
import decompress, { type File } from 'decompress'
import type { Client } from 'discord.js'
import { type CrowdinCode, LANGUAGE_OBJECTS, type LanguageObject } from '../constants/i18n'
import { request } from '../utils/request'
import { withRetry } from '../utils/withRetry'
import type { LocalizationItem } from './LocalizationManager'
import { LogManager, type Severity } from './LogManager'

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

  #cache: {
    data: Map<number, File[]>
    lastFetchedAt: Map<number, number>
    ttl: number
  } = {
    data: new Map<number, File[]>(),
    lastFetchedAt: new Map<number, number>(),
    ttl: 15 * 60 * 1000, // 15 minutes
  }

  #logger: LogManager

  constructor(client: Client, severity: Severity = 'info') {
    this.#logger = new LogManager('CrowdinManager', severity)
    this.#logger.log('info', 'Instantiating manager')

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
    const { data: projectProgress } = await withRetry(
      attempt => {
        this.#logger.log('info', 'Getting project progress', { attempt })
        return this.#crowdin.translationStatusApi.getProjectProgress(projectId)
      },
      { logger: this.#logger }
    )

    return projectProgress
  }

  async buildProject(projectId: number) {
    this.#logger.log('info', 'Building project', { projectId })

    try {
      const {
        data: { id: buildId },
      } = await withRetry(
        attempt => {
          this.#logger.log('info', 'Building project', { attempt, projectId })
          return this.#crowdin.translationsApi.buildProject(projectId)
        },
        { logger: this.#logger }
      )
      return buildId
    } catch {
      const builds = await withRetry(
        attempt => {
          this.#logger.log('warn', 'Building project failed, falling back to latest build', {
            attempt,
            projectId,
          })
          return this.#crowdin.translationsApi.listProjectBuilds(projectId, {
            limit: 1,
          })
        },
        { logger: this.#logger }
      )

      return builds.data[0].data.id
    }
  }

  async waitForBuild(buildId: number, projectId: number) {
    this.#logger.log('info', 'Waiting for build to finish', { buildId, projectId })

    let status = 'inProgress'
    while (status === 'inProgress') {
      const { data } = await withRetry(
        attempt => {
          this.#logger.log('info', 'Waiting for build to finish', {
            attempt,
            buildId,
            projectId,
          })
          return this.#crowdin.translationsApi.checkBuildStatus(projectId, buildId)
        },
        { logger: this.#logger }
      )
      status = data.status
      if (status === 'failed') throw new Error('Crowdin build failed')
      if (status !== 'finished') await new Promise(res => setTimeout(res, 2000))
    }
  }

  async downloadBuildArtefact(buildId: number, projectId: number) {
    this.#logger.log('info', 'Downloading build artefact', {
      buildId,
      projectId,
    })

    // Retrieve the URL to download the zip file with all CSV translation files
    const { data } = await withRetry(
      () => this.#crowdin.translationsApi.downloadTranslations(projectId, buildId),
      { logger: this.#logger }
    )

    // Download the archive
    const zipBuffer = await request(this.#logger, data.url, undefined, 'buffer')

    // Unzip the archive
    return decompress(zipBuffer)
  }

  async parseTranslationFiles(files: File[]) {
    const jsons: CrowdinItem[][] = []

    for (const file of files) {
      const content = file.data.toString('utf-8')
      try {
        const json = await csvtojson().fromString(content)
        jsons.push(json)
      } catch (error) {
        this.#logger.log('warn', 'Failed to parse CSV', { error, path: file.path })
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
    this.#logger.log('info', 'Fetching all project files', {
      forceRefresh,
      projectId,
    })

    const now = Date.now()
    const cachedFiles = this.#cache.data.get(projectId)
    const lastFetchedAt = this.#cache.lastFetchedAt.get(projectId) ?? 0

    if (!forceRefresh && cachedFiles && now - lastFetchedAt < this.#cache.ttl) {
      this.#logger.log('info', 'Reading all project files from cache', {
        age: now - lastFetchedAt,
        projectId,
        ttl: this.#cache.ttl,
      })
      return cachedFiles
    }

    const buildId = await this.buildProject(projectId)
    await this.waitForBuild(buildId, projectId)
    const files = await this.downloadBuildArtefact(buildId, projectId)

    this.#cache.data.set(projectId, files)
    this.#cache.lastFetchedAt.set(projectId, now)

    return files
  }

  async fetchStoreTranslations(forceRefresh = false) {
    this.#logger.log('info', 'Fetching store translations', { forceRefresh })

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
