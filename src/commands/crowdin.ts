import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { logger } from '../utils/logger'
import type {
  LanguagesModel,
  ResponseObject,
  StringTranslationsModel,
  TranslationStatusModel,
} from '@crowdin/crowdin-api-client'
import crowdin, { CROWDIN_PROJECT_ID } from '../utils/crowdin'
import { LOCALES } from '../constants/i18n'

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
  const locale = options.getString('language') ?? ''
  const visible = options.getBoolean('visible') ?? false
  const flags = visible ? undefined : MessageFlags.Ephemeral

  const { data: projectProgress } =
    await crowdin.client.translationStatusApi.getProjectProgress(
      CROWDIN_PROJECT_ID
    )

  const header = '**Translation progress:**\n'
  const footer =
    '\n\n-# If you think your translation progress is not accurate, make sure you have saved your translations in Crowdin. Drafts do not count towards completion.'

  if (locale) {
    const languageData = projectProgress.find(
      ({ data }) => data.languageId === locale
    )

    if (!languageData) {
      return interaction.reply({
        content: `Could not find language object for \`${locale}\`.`,
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
  const key = options.getString('key', true)
  const locale = options.getString('language') ?? ''
  const visible = options.getBoolean('visible') ?? false
  const flags = visible ? undefined : MessageFlags.Ephemeral

  await interaction.deferReply({ flags })

  const string = await crowdin.getStringItem(key)

  if (!string) {
    return interaction.editReply({
      content: `Could not find translation object for \`${key}\`.`,
    })
  }

  if (locale) {
    const language = await crowdin.getLanguage(locale)

    if (!language) {
      const error = `Could not find language object for \`${locale}\`.`
      return interaction.editReply({ content: error })
    }

    const [translation] = await crowdin.getStringTranslations(string.id, [
      language,
    ])

    const content = `
Translations for term \`${key}\`:
- English (original): _${string.text}_
- ${formatTranslation(translation)}`

    return interaction.editReply({ content })
  }

  const translations = await crowdin.getStringTranslationsForAllLanguages(
    string.id
  )

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

  return interaction.editReply({ content })
}

function formatTranslation({
  language,
  translation,
}: {
  language: LanguagesModel.Language
  translation: ResponseObject<StringTranslationsModel.StringTranslation>
}) {
  if (!translation) {
    return `${formatLanguage(language)}:`
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

  return `${formatLanguage(language)}: _${data.text}_ (added on <t:${date}:d> by ${displayName})`
}

function formatLanguage(language: LanguagesModel.Language) {
  return `${language.name} (\`${language.locale}\`)`
}
