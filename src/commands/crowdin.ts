import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { logger } from '../utils/logger'
import type Client from '@crowdin/crowdin-api-client'
import {
  default as Crowdin,
  type ResponseObject,
  type TranslationStatusModel,
} from '@crowdin/crowdin-api-client'
import { CROWDIN_TOKEN } from '../config'
import { LOCALES } from '../constants/i18n'

// @ts-expect-error
const crowdin: Client = new Crowdin.default({
  token: CROWDIN_TOKEN ?? '',
})

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
  .setDescription('Interact with Crowdin')

export async function execute(interaction: ChatInputCommandInteraction) {
  logger.command(interaction)

  const { guildId, client, options } = interaction
  const language = options.getString('language') ?? ''
  const visible = options.getBoolean('visible') ?? false
  const flags = visible ? undefined : MessageFlags.Ephemeral

  if (!guildId) return

  const projects = await crowdin.projectsGroupsApi.listProjects()
  const project = projects.data.find(
    project => project.data.identifier === 'eternal-hero'
  )
  if (!project) throw new Error('Cannot find Crowdin project.')

  const projectProgress = await crowdin.translationStatusApi.getProjectProgress(
    project.data.id
  )
  const header = '**Translation progress:**\n'

  if (language) {
    const languageData = projectProgress.data.find(findLanguageObject(language))

    if (!languageData) {
      return interaction.reply({
        content: `Could not find language object for \`${language}\`.`,
        flags: MessageFlags.Ephemeral,
      })
    }

    const languageProgress = header + formatLanguageProgress(languageData)
    return interaction.reply({ content: languageProgress, flags })
  }

  const overall =
    header + projectProgress.data.map(formatLanguageProgress).join('\n')

  await interaction.reply({ content: overall, flags })
}

function formatLanguageProgress({
  data,
}: ResponseObject<TranslationStatusModel.LanguageProgress>) {
  return `- ${data.language.name} (\`${data.languageId}\`): translated ${data.translationProgress}% / approved ${data.approvalProgress}%`
}

function findLanguageObject(language: string) {
  return ({
    data,
  }: ResponseObject<TranslationStatusModel.LanguageProgress>) => {
    return data.languageId === language
  }
}
