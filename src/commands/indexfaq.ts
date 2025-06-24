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

  const { client } = interaction
  const { faqManager, searchManager } = client
  const { threads } = faqManager
  const threadsData = await Promise.all(threads.map(faqManager.resolveThread))

  const index = searchManager.index.namespace('en')
  const entries = threadsData
    .filter(entry => entry.content)
    .map(searchManager.prepareForIndexing)
  const count = entries.length

  while (entries.length) {
    const batch = entries.splice(0, 90)
    await index.upsertRecords(batch)
  }

  await interaction.editReply({
    content: `Indexed ${count} entries into Pinecone.`,
  })
}
