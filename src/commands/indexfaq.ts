import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'

import { logger } from '../utils/logger'

export const scope = 'OFFICIAL'

export const data = new SlashCommandBuilder()
  .setName('indexfaq')
  .setDescription('Index the FAQ in Pinecone')

export async function execute(interaction: ChatInputCommandInteraction) {
  logger.command(interaction)

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const { faqManager, searchManager } = interaction.client
  const { threads } = faqManager

  // Retrive the content for every thread in the FAQ
  const threadsWithContent = await Promise.all(
    threads.map(faqManager.resolveThread)
  )

  // Format the content for Pinecone indexation
  const entries = threadsWithContent
    .filter(entry => entry.content)
    .map(searchManager.prepareForIndexing)
  const count = entries.length

  // Index all the threads into Pinecone
  await searchManager.indexRecords(entries)

  // Acknowledge the indexation
  await interaction.editReply({
    content: `Indexed ${count} entries into Pinecone.`,
  })
}
