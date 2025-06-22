import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'

import { logger } from '../utils/logger'

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
  /*.addBooleanOption(option =>
    option
      .setName('visible')
      .setDescription('Whether it should show for everyone')
  )*/
  .setDescription('Search the FAQ')

export async function execute(interaction: ChatInputCommandInteraction) {
  logger.command(interaction)

  const { options, client } = interaction
  const { searchManager, localizationManager } = client

  const visible = options.getBoolean('visible') ?? false
  const raw = options.getBoolean('raw') ?? false
  // const flags = visible ? undefined : MessageFlags.Ephemeral
  const query = options.getString('question', true)

  await interaction.deferReply()

  const englishQuery = await localizationManager.translateToEnglish(query)
  const [hit] = await searchManager.search(englishQuery)

  if (!hit) {
    return interaction.editReply({ content: searchManager.NO_RESULTS_MESSAGE })
  }

  // @ts-expect-error
  const { entry_name: question, chunk_text: answer } = hit.fields

  const localizedAnswer = raw
    ? await localizationManager.translateFromEnglish(answer, query)
    : await localizationManager.translateFromEnglishAndRephrase(query, {
        question,
        answer,
      })

  return interaction.editReply({ content: localizedAnswer ?? answer })
}
