import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { logger } from '../utils/logger'
import type Client from '@crowdin/crowdin-api-client'
import {
  default as Crowdin,
  type LanguagesModel,
  type ResponseObject,
  type TranslationStatusModel,
} from '@crowdin/crowdin-api-client'
import { CROWDIN_TOKEN } from '../config'
import { LOCALES } from '../constants/i18n'

// @ts-expect-error
const crowdin: Client = new Crowdin.default({ token: CROWDIN_TOKEN ?? '' })

// This is just a short cut to avoid querying the API just to retrieve the
// project ID. It’s a bit weird that the Crowdin URLs do not share these IDs to
// begin with to be honest.
const CROWDIN_PROJECT_ID = 797774

export const data = new SlashCommandBuilder()
  .setName('crowdin')
  .addSubcommand(subcommand =>
    subcommand
      .setName('progress')
      .setDescription('Get the translation progress')
      .addStringOption(option =>
        option
          .setName('language')
          .setDescription('Translation language')
          .setChoices(
            Object.values(LOCALES)
              .filter(locale => locale.crowdin)
              .map(locale => ({
                name: locale.languageName,
                value: locale.languageCode,
              }))
          )
      )
      .addBooleanOption(option =>
        option
          .setName('visible')
          .setDescription('Whether it should show for everyone')
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('term')
      .setDescription('Get the translations for a specific term')
      .addStringOption(option =>
        option
          .setName('key')
          .setDescription('Translation key')
          .setRequired(true)
      )
      .addBooleanOption(option =>
        option
          .setName('visible')
          .setDescription('Whether it should show for everyone')
      )
  )
  .setDescription('Interact with Crowdin')

export async function execute(interaction: ChatInputCommandInteraction) {
  logger.command(interaction)

  const { guildId, options } = interaction
  if (!guildId) return

  if (options.getSubcommand() === 'progress') {
    return commandProgress(interaction)
  }

  if (options.getSubcommand() === 'term') {
    return commandTerm(interaction)
  }
}

async function commandProgress(interaction: ChatInputCommandInteraction) {
  const { options } = interaction
  const language = options.getString('language') ?? ''
  const visible = options.getBoolean('visible') ?? false
  const flags = visible ? undefined : MessageFlags.Ephemeral

  const { data: projectProgress } =
    await crowdin.translationStatusApi.getProjectProgress(CROWDIN_PROJECT_ID)

  const header = '**Translation progress:**\n'
  const footer =
    '\n\n-# If you think your translation progress is not accurate, make sure you have saved your translations in Crowdin. Drafts do not count towards completion.'

  if (language) {
    const languageData = projectProgress.find(
      ({ data }) => data.languageId === language
    )

    if (!languageData) {
      return interaction.reply({
        content: `Could not find language object for \`${language}\`.`,
        flags: MessageFlags.Ephemeral,
      })
    }

    return interaction.reply({
      content: header + formatLanguageProgress(languageData) + footer,
      flags,
    })
  }

  return interaction.reply({
    content:
      header + projectProgress.map(formatLanguageProgress).join('\n') + footer,
    flags,
  })
}

function formatLanguageProgress({
  data: { language, languageId, translationProgress, approvalProgress },
}: ResponseObject<TranslationStatusModel.LanguageProgress>) {
  return `- ${language.name} (\`${languageId}\`): translated ${translationProgress}% / approved ${approvalProgress}%`
}

const nameMapping = {
  'Alex Dvl': 'iFunz',
  'Michał Malarek': 'Exor',
  Артур: 'roartie',
  Kaiichi0: 'Kaichii',
  酷玩熊: 'Kukuch',
  김지운: '망고',
}

async function commandTerm(interaction: ChatInputCommandInteraction) {
  const { options } = interaction
  const key = options.getString('key', true)
  const visible = options.getBoolean('visible') ?? false
  const flags = visible ? undefined : MessageFlags.Ephemeral

  const { targetLanguages: languages } = await getCrowdinProject()
  const term = await getProjectString(CROWDIN_PROJECT_ID, key)

  if (!term) {
    return interaction.reply({
      content: `Could not find translation object for \`${key}\`.`,
      flags: MessageFlags.Ephemeral,
    })
  }

  const translations = await Promise.all(
    languages.map(language =>
      getProjectStringTranslation(CROWDIN_PROJECT_ID, term.id, language)
    )
  )

  const filled = translations.filter(({ translation }) => Boolean(translation))
  const missing = translations.filter(({ translation }) => !translation)
  const missCount = missing.length
  const content = `
Translations for term \`${key}\`:
- English (original): _${term.text}_
${filled
  .map(
    ({ language: { name, locale }, translation: { data } }) =>
      `- ${name} (\`${locale}\`): _${data.text}_ (added on <t:${new Date(data.createdAt).valueOf() / 1000}:d> by ${nameMapping[data.user.fullName as keyof typeof nameMapping] ?? data.user.fullName})`
  )
  .join('\n')}

${
  missCount > 0
    ? `-# ${missCount} translation${missCount === 1 ? '' : 's'} missing: ${missing.map(({ language }) => language.locale).join(', ')}.`
    : ''
}
  `

  return interaction.reply({
    content,
    flags,
  })
}

async function getCrowdinProject() {
  const projects = await crowdin.projectsGroupsApi.listProjects()
  const project = projects.data.find(
    project => project.data.identifier === 'eternal-hero'
  )
  if (!project) throw new Error('Cannot find Crowdin project.')

  return project.data
}

async function getProjectString(projectId: number, key: string) {
  const projectStrings =
    await crowdin.sourceStringsApi.listProjectStrings(projectId)
  const projectString = projectStrings.data.find(
    item => item.data.identifier === key
  )

  return projectString?.data
}

async function getProjectStringTranslation(
  projectId: number,
  projectStringId: number,
  language: LanguagesModel.Language
) {
  const outcome = await crowdin.stringTranslationsApi.listStringTranslations(
    projectId,
    projectStringId,
    language.id
  )

  return { language, translation: outcome.data[0] }
}
