import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'

import { logger } from '../utils/logger'
import type { PineconeMetadata } from '../managers/SearchManager'
import { ENGLISH_LOCALE, LOCALES } from '../constants/i18n'

export const scope = 'OFFICIAL'

export const data = new SlashCommandBuilder()
  .setName('ask')
  .addStringOption(option =>
    option
      .setName('question')
      .setDescription('Question to ask the FAQ')
      .setRequired(true)
  )
  .addBooleanOption(option =>
    option
      .setName('raw')
      .setDescription('Whether to skip rephrasing by ChatGPT')
  )
  .addBooleanOption(option =>
    option
      .setName('visible')
      .setDescription('Whether it should show for everyone')
  )
  .setDescription('Ask the FAQ')

export async function execute(interaction: ChatInputCommandInteraction) {
  logger.command(interaction, 'Starting command execution')

  const { options, client } = interaction
  const { searchManager, localizationManager } = client

  const query = options.getString('question', true)
  const visible = options.getBoolean('visible') ?? false
  const raw = options.getBoolean('raw') ?? false
  const flags = visible ? undefined : MessageFlags.Ephemeral

  await interaction.deferReply({ flags })

  logger.command(interaction, 'Guessing the input’s language')
  const language = await localizationManager.guessLanguage(query)

  if (!language) {
    logger.command(interaction, 'Aborting due to lack of guessed language')
    return interaction.editReply({
      content:
        'Unfortunately, the language could not be guessed from your query.',
    })
  }

  logger.command(interaction, 'Performing the search', { language })
  const { results } = await searchManager.search(query, 'VECTOR', language, 1)
  const [result] = results

  if (!result) {
    logger.command(interaction, 'Returning a lack of results', { language })
    const locale = LOCALES.find(locale => locale.languageCode === language)
    const localizedError = locale?.messages.no_results
    const error = localizedError ?? ENGLISH_LOCALE.messages.no_results
    return interaction.editReply({ content: error })
  }

  const { entry_question: question, entry_answer: answer } =
    result.fields as PineconeMetadata

  if (raw) {
    logger.command(interaction, 'Returning a raw answer', { language })
    return interaction.editReply({ content: answer })
  }

  const context = { question, answer }
  logger.command(interaction, 'Summarizing the answer', { language })
  const localizedAnswer = await localizationManager.summarize(query, context)

  return interaction.editReply({ content: localizedAnswer ?? answer })
}
