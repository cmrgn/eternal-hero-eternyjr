import type Client from '@crowdin/crowdin-api-client'
import {
  default as Crowdin,
  type SourceStringsModel,
  type LanguagesModel,
} from '@crowdin/crowdin-api-client'
import decompress from 'decompress'
import fetch from 'node-fetch'
import csvtojson from 'csvtojson'

import { CROWDIN_TOKEN } from '../constants/config'
import { pool } from './pg'
import { logger } from './logger'
import type { LanguageCode } from '../constants/i18n'
import type { LocalizationItem } from '../managers/LocalizationManager'

type StringId = SourceStringsModel.String['id']

export type CrowdinItem = Record<LanguageCode, string> & {
  Key: string
  Context?: string
}

// @ts-expect-error
const client: Client = new Crowdin.default({ token: CROWDIN_TOKEN ?? '' })

// This is just a short cut to avoid querying the API just to retrieve the
// project ID. It’s a bit weird that the Crowdin URLs do not share these IDs to
// begin with to be honest.
export const CROWDIN_PROJECT_ID = 797774

async function getProjectStringTranslation(
  stringId: StringId,
  language: LanguagesModel.Language
) {
  const outcome = await client.stringTranslationsApi.listStringTranslations(
    CROWDIN_PROJECT_ID,
    stringId,
    language.id
  )

  return { language, translation: outcome.data[0] }
}

async function getProjectStrings(projectId: number) {
  const allStrings: SourceStringsModel.String[] = []
  let offset = 0
  const limit = 500 // Max limit per request

  logger.info('CROWDIN', {
    endPoint: 'sourceStringsApi.listProjectStrings',
    params: { projectId, limit },
  })

  while (true) {
    const { data } = await client.sourceStringsApi.listProjectStrings(
      projectId,
      { limit, offset }
    )

    allStrings.push(...data.map(item => item.data))
    if (data.length < limit) break
    offset += limit
  }

  return allStrings
}

async function getProject() {
  logger.info('CROWDIN', { endPoint: 'projectsGroupsApi.listProjects' })
  const projects = await client.projectsGroupsApi.listProjects()
  const project = projects.data.find(
    project => project.data.identifier === 'eternal-hero'
  )
  if (!project) throw new Error('Cannot find Crowdin project.')

  return project.data
}

async function cacheCrowdinStrings(strings: SourceStringsModel.String[]) {
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

async function getLanguage(locale: string) {
  const { targetLanguages: languages } = await getProject()
  return languages.find(language => language.id === locale)
}

async function getStringTranslationsForAllLanguages(stringId: StringId) {
  const { targetLanguages: languages } = await getProject()
  return getStringTranslations(stringId, languages)
}

async function getStringTranslations(
  stringId: StringId,
  languages: LanguagesModel.Language[]
) {
  logger.info('CROWDIN', {
    endPoint: 'stringTranslationsApi.listStringTranslations',
    params: {
      projectId: CROWDIN_PROJECT_ID,
      stringId,
      languages: languages.length,
    },
  })
  return Promise.all(
    languages.map(language => getProjectStringTranslation(stringId, language))
  )
}

async function getStringItem(identifier: string) {
  const { rows } = await pool.query(
    'SELECT string_id, text FROM crowdin_strings WHERE identifier = $1',
    [identifier]
  )

  const result: { string_id: StringId; text: string } | undefined = rows[0]

  if (!result) {
    const strings = await getProjectStrings(CROWDIN_PROJECT_ID)
    await cacheCrowdinStrings(strings)

    return strings.find(string => string.identifier === identifier)
  }

  return { id: result.string_id, text: result.text }
}

async function buildProject() {
  const {
    data: { id: buildId },
  } = await client.translationsApi.buildProject(CROWDIN_PROJECT_ID)

  return buildId
}

async function waitForBuild(buildId: number) {
  let status = 'inProgress'
  while (status === 'inProgress') {
    const { data } = await client.translationsApi.checkBuildStatus(
      CROWDIN_PROJECT_ID,
      buildId
    )
    status = data.status
    if (status === 'failed') throw new Error('Crowdin build failed')
    if (status !== 'finished') await new Promise(res => setTimeout(res, 1000))
  }
}

async function downloadBuildArtefact(buildId: number) {
  // Retrieve the URL to download the zip file with all CSV translation files
  const { data } = await client.translationsApi.downloadTranslations(
    CROWDIN_PROJECT_ID,
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

export default {
  client,
  getProject,
  getStringItem,
  getStringTranslationsForAllLanguages,
  getStringTranslations,
  getLanguage,
  buildProject,
  waitForBuild,
  downloadBuildArtefact,
}
