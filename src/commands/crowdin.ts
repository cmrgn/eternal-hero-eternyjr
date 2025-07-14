import { type ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js'
import { type CrowdinCode, LANGUAGE_OBJECTS, type LanguageObject } from '../constants/i18n'
import type { ResponseObject, TranslationStatusModel } from '../managers/CrowdinManager'
import type { LocalizationItem } from '../managers/LocalizationManager'
import { logger } from '../utils/logger'

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
        option.setName('visible').setDescription('Whether it should show for everyone')
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('term')
      .setDescription('Get the translations for a specific term')
      .addStringOption(option =>
        option.setName('key').setDescription('Translation key').setRequired(true)
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
        option.setName('visible').setDescription('Whether it should show for everyone')
      )
  )
  .setDescription('Interact with Crowdin')

export async function execute(interaction: ChatInputCommandInteraction) {
  const { guildId, options } = interaction
  if (!guildId) return

  logger.logCommand(interaction, 'Starting command execution', {
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
  const { options, client } = interaction
  const { Crowdin } = client.managers
  const crowdinCode = options.getString('language') as CrowdinCode | undefined
  const visible = options.getBoolean('visible') ?? false
  const flags = visible ? undefined : MessageFlags.Ephemeral

  logger.logCommand(interaction, 'Getting project progress')
  const projectProgress = await Crowdin.getProjectProgress()

  const header = '**Translation progress:**\n'
  const footer =
    '\n\n-# If you think your translation progress is not accurate, make sure you have saved your translations in Crowdin. Drafts do not count towards completion.'

  if (crowdinCode) {
    const languageData = projectProgress.find(({ data }) => data.languageId === crowdinCode)

    if (!languageData) {
      logger.logCommand(interaction, 'Missing language object', {
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
    content: header + projectProgress.map(formatLanguageProgress).join('\n') + footer,
    flags,
  })
}

function formatLanguageProgress({
  data: { language, languageId, translationProgress, approvalProgress },
}: ResponseObject<TranslationStatusModel.LanguageProgress>) {
  return `- ${language.name} (\`${languageId}\`): translated ${translationProgress}% · approved ${approvalProgress}%`
}

async function commandTerm(interaction: ChatInputCommandInteraction) {
  const { options, client } = interaction
  const { Crowdin } = client.managers
  const key = options.getString('key', true)
  const crowdinCode = options.getString('language') as CrowdinCode | undefined
  const visible = options.getBoolean('visible') ?? false
  const flags = visible ? undefined : MessageFlags.Ephemeral

  await interaction.deferReply({ flags })

  const files = await Crowdin.fetchAllProjectTranslations()
  const translations = await Crowdin.extractTranslationsFromFiles(files)
  const string = translations.find(translation => translation.key === key)

  if (!string) {
    logger.logCommand(interaction, 'Missing string object', { key })
    return interaction.editReply({
      content: `Could not find translation object for \`${key}\`.`,
    })
  }

  const languageObjects = Crowdin.getLanguages({ withEnglish: false })

  if (crowdinCode) {
    const languageObject = languageObjects.find(object => object.crowdinCode === crowdinCode)

    if (!languageObject) {
      logger.logCommand(interaction, 'Missing language object', {
        locale: crowdinCode,
      })
      const error = `Could not find language object for \`${crowdinCode}\`.`
      return interaction.editReply({ content: error })
    }

    const content = `
Translations for term \`${key}\`:
- English (original): _${string.translations.en}_
- ${formatLanguage(languageObject)}: ${string.translations[crowdinCode]}`

    return interaction.editReply({ content })
  }

  const filled = languageObjects.filter(({ crowdinCode }) => crowdinCode in string.translations)
  const missing = languageObjects.filter(({ crowdinCode }) => !(crowdinCode in string.translations))
  const missCount = Object.keys(missing).length
  const content = `
Translations for term \`${key}\`:
- English (original): _${string.translations.en}_
- ${filled.map(formatTranslation(string)).join('\n- ')}

${
  missCount > 0
    ? `-# ${missCount} translation${missCount === 1 ? '' : 's'} missing: ${missing.map(({ locale }) => locale).join(', ')}.`
    : ''
}
  `

  const [response, ...responses] = splitMarkdownList(content)
  await interaction.editReply({ content: response })
  for (const response of responses) {
    await interaction.followUp({ content: response, flags })
  }
}

function formatTranslation(string: LocalizationItem) {
  return (languageObject: LanguageObject) => {
    if (!string) return `${formatLanguage(languageObject)}:`
    return `${formatLanguage(languageObject)}: _${string.translations[languageObject.crowdinCode]}_`
  }
}

function formatLanguage(languageObject: LanguageObject) {
  return `${languageObject.languageName} (\`${languageObject.crowdinCode}\`)`
}

function splitMarkdownList(message: string, maxLength = 2000) {
  const lines = message.split('\n')
  const chunks: string[] = []
  let current = ''

  for (const line of lines) {
    // Handle lines longer than maxLength by slicing them into pieces
    if (line.length > maxLength) {
      if (current) {
        chunks.push(current)
        current = ''
      }
      for (let i = 0; i < line.length; i += maxLength) {
        chunks.push(line.slice(i, i + maxLength))
      }
      continue
    }

    const candidate = current + (current ? '\n' : '') + line
    if (candidate.length > maxLength) {
      if (current) chunks.push(current)
      current = line
    } else {
      current = candidate
    }
  }

  if (current) chunks.push(current)
  return chunks
}
