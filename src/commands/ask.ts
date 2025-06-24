import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'

import { logger } from '../utils/logger'
import type { PineconeMetadata } from '../managers/SearchManager'

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
  logger.command(interaction)

  const { options, client } = interaction
  const { searchManager, localizationManager } = client

  const query = options.getString('question', true)
  const visible = options.getBoolean('visible') ?? false
  const raw = options.getBoolean('raw') ?? false
  const flags = visible ? undefined : MessageFlags.Ephemeral

  await interaction.deferReply({ flags })

  const englishQuery =
    (await localizationManager.translateToEnglish(query)) ?? query
  const { results } = await searchManager.search(
    englishQuery,
    'VECTOR',
    'en',
    1
  )
  const [result] = results

  if (!result) {
    return interaction.editReply({
      content:
        'Unfortunately, no relevant content was found for your question. Please try rephrasing it or ask a different question.',
    })
  }

  const { entry_question: question, entry_answer: answer } =
    result.fields as PineconeMetadata

  const localizedAnswer = raw
    ? await localizationManager.translateFromEnglish(answer, query)
    : await localizationManager.translateFromEnglishAndRephrase(query, {
        question,
        answer,
      })

  return interaction.editReply({ content: localizedAnswer ?? answer })
}
