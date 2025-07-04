import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'

import { logger } from '../utils/logger'
import type { PineconeMetadata } from '../managers/SearchManager'
import { ENGLISH_LANGUAGE_OBJECT, LANGUAGE_OBJECTS } from '../constants/i18n'
import { createEmbed } from '../utils/createEmbed'

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
  /*
  .addBooleanOption(option =>
    option
      .setName('visible')
      .setDescription('Whether it should show for everyone')
  )
  */
  .setDescription('Ask the FAQ')

export async function execute(interaction: ChatInputCommandInteraction) {
  logger.logCommand(interaction, 'Starting command execution')

  const { options, client } = interaction
  const { searchManager, localizationManager, promptManager } = client

  const query = options.getString('question', true)
  // @TODO: bring back the visibility option after the beta phase
  const visible = true // options.getBoolean('visible') ?? false
  const raw = options.getBoolean('raw') ?? false
  const flags = visible ? undefined : MessageFlags.Ephemeral
  const embed = createEmbed(false)
  embed.setTitle(`Asked: “${query}”`)

  await interaction.deferReply({ flags })

  logger.logCommand(interaction, 'Guessing the input’s language')
  const guessedLanguage = await localizationManager.guessCrowdinLanguage(query)
  const languageObject = LANGUAGE_OBJECTS.find(
    languageObject => languageObject.crowdinCode === guessedLanguage
  )

  if (!languageObject) {
    logger.logCommand(interaction, 'Aborting due to lack of guessed language')
    embed.setDescription(
      'Unfortunately, the language could not be guessed from your query, or it is not currently supported..'
    )
    return interaction.editReply({ embeds: [embed] })
  }

  const { crowdinCode } = languageObject

  logger.logCommand(interaction, 'Performing the search', { crowdinCode })
  const { results } = await searchManager.search(
    query,
    'VECTOR',
    crowdinCode,
    1
  )
  const [result] = results

  if (!result) {
    logger.logCommand(interaction, 'Returning a lack of results', {
      crowdinCode,
    })
    const localizedError = languageObject?.messages.no_results
    const error = localizedError ?? ENGLISH_LANGUAGE_OBJECT.messages.no_results
    embed.setDescription(error)
    return interaction.editReply({ embeds: [embed] })
  }

  const {
    entry_question: question,
    entry_answer: answer,
    entry_url: url,
    entry_indexed_at: indexedAt,
  } = result.fields as PineconeMetadata
  const timestamp = `<t:${Math.round(new Date(indexedAt).valueOf() / 1000)}:d>`

  embed.addFields({ name: 'Source', value: url, inline: true })
  embed.addFields({ name: 'Indexed on', value: timestamp, inline: true })

  if (raw) {
    logger.logCommand(interaction, 'Returning a raw answer', { crowdinCode })
    embed.setDescription(answer)

    return interaction.editReply({ embeds: [embed] })
  }

  const context = { question, answer, languageObject }

  logger.logCommand(interaction, 'Summarizing the answer', {
    question,
    crowdinCode,
  })
  const localizedAnswer = await promptManager.summarize(query, context)

  embed.setDescription(localizedAnswer ?? answer)

  const message = await interaction.editReply({
    embeds: [embed],
  })

  await Promise.all([message.react('👍'), message.react('👎')])
}
