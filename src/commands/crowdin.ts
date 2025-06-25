import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import type {
  LanguagesModel,
  ResponseObject,
  StringTranslationsModel,
  TranslationStatusModel,
} from '../managers/CrowdinManager'

import { logger } from '../utils/logger'
import { type CrowdinCode, LANGUAGE_OBJECTS } from '../constants/i18n'
import { splitMarkdownList } from '../utils/splitMarkdownList'

export const scope = 'OFFICIAL'

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
            Object.values(LANGUAGE_OBJECTS)
              .filter(languageObject => languageObject.isOnCrowdin)
              .map(languageObject => ({
                name: languageObject.languageName,
                value: languageObject.crowdinCode,
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
      .addStringOption(option =>
        option
          .setName('language')
          .setDescription('Translation language')
          .setChoices(
            Object.values(LANGUAGE_OBJECTS)
              .filter(languageObject => languageObject.isOnCrowdin)
              .map(languageObject => ({
                name: languageObject.languageName,
                value: languageObject.crowdinCode,
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
  const { guildId, options } = interaction
  if (!guildId) return

  logger.command(interaction, 'Starting command execution', {
    subcommand: options.getSubcommand(),
  })

  if (options.getSubcommand() === 'progress') {
    return commandProgress(interaction)
  }

  if (options.getSubcommand() === 'term') {
    return commandTerm(interaction)
  }
}

async function commandProgress(interaction: ChatInputCommandInteraction) {
  const { options } = interaction
  const { crowdinManager } = interaction.client
  const crowdinCode = options.getString('language') as CrowdinCode | undefined
  const visible = options.getBoolean('visible') ?? false
  const flags = visible ? undefined : MessageFlags.Ephemeral

  logger.command(interaction, 'Getting project progress')
  const projectProgress = await crowdinManager.getProjectProgress()

  const header = '**Translation progress:**\n'
  const footer =
    '\n\n-# If you think your translation progress is not accurate, make sure you have saved your translations in Crowdin. Drafts do not count towards completion.'

  if (crowdinCode) {
    const languageData = projectProgress.find(
      ({ data }) => data.languageId === crowdinCode
    )

    if (!languageData) {
      logger.command(interaction, 'Missing language object', {
        locale: crowdinCode,
      })
      return interaction.reply({
        content: `Could not find language object for \`${crowdinCode}\`.`,
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
  return `- ${language.name} (\`${languageId}\`): translated ${translationProgress}% · approved ${approvalProgress}%`
}

async function commandTerm(interaction: ChatInputCommandInteraction) {
  const { options } = interaction
  const { crowdinManager } = interaction.client
  const key = options.getString('key', true)
  const crowdinCode = options.getString('language') as CrowdinCode | undefined
  const visible = options.getBoolean('visible') ?? false
  const flags = visible ? undefined : MessageFlags.Ephemeral

  await interaction.deferReply({ flags })

  logger.command(interaction, 'Getting string object')
  const string = await crowdinManager.getStringItem(key)

  if (!string) {
    logger.command(interaction, 'Missing string object', { key })
    return interaction.editReply({
      content: `Could not find translation object for \`${key}\`.`,
    })
  }

  if (crowdinCode) {
    const languageObject = await crowdinManager.getLanguageObject(crowdinCode)

    if (!languageObject) {
      logger.command(interaction, 'Missing language object', {
        locale: crowdinCode,
      })
      const error = `Could not find language object for \`${crowdinCode}\`.`
      return interaction.editReply({ content: error })
    }

    const [translation] = await crowdinManager.getStringTranslations(
      string.id,
      [languageObject]
    )

    const content = `
Translations for term \`${key}\`:
- English (original): _${string.text}_
- ${formatTranslation(translation)}`

    return interaction.editReply({ content })
  }

  logger.command(interaction, 'Getting all translations for string', {
    id: string.id,
  })
  const translations =
    await crowdinManager.getStringTranslationsForAllLanguages(string.id)

  const filled = translations.filter(
    ({ translation }) =>
      Boolean(translation) && translation.data.text.length > 0
  )
  const missing = translations.filter(
    ({ translation }) => !translation || translation.data.text.length === 0
  )
  const missCount = missing.length
  const content = `
Translations for term \`${key}\`:
- English (original): _${string.text}_
- ${filled.map(formatTranslation).join('\n- ')}

${
  missCount > 0
    ? `-# ${missCount} translation${missCount === 1 ? '' : 's'} missing: ${missing.map(({ language }) => language.locale).join(', ')}.`
    : ''
}
  `

  const [response, ...responses] = splitMarkdownList(content)
  await interaction.editReply({ content: response })
  for (const response of responses) {
    await interaction.followUp({ content: response, flags })
  }
}

function formatTranslation({
  language: crowdinLanguageObject,
  translation,
}: {
  language: LanguagesModel.Language
  translation: ResponseObject<StringTranslationsModel.StringTranslation>
}) {
  if (!translation) {
    return `${formatLanguage(crowdinLanguageObject)}:`
  }

  const { data } = translation
  const nameMapping = {
    'Alex Dvl': 'iFunz',
    'Michał Malarek': 'Exor',
    Артур: 'roartie',
    Kaiichi0: 'Kaichii',
    酷玩熊: 'Kukuch',
    김지운: '망고',
    'Gan Ying Zhi': 'Rain',
  }
  const userName = data.user.fullName
  const displayName =
    nameMapping[userName as keyof typeof nameMapping] ?? userName
  const date = new Date(data.createdAt).valueOf() / 1000

  return `${formatLanguage(crowdinLanguageObject)}: _${data.text}_ (added on <t:${date}:d> by ${displayName})`
}

function formatLanguage(crowdinLanguageObject: LanguagesModel.Language) {
  return `${crowdinLanguageObject.name} (\`${crowdinLanguageObject.locale}\`)`
}
