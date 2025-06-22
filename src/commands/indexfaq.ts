import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { Pinecone } from '@pinecone-database/pinecone'

import { logger } from '../utils/logger'
import { PINECONE_API_KEY } from '../constants/config'

export const scope = 'OFFICIAL'

const INDEX_NAME = 'faq-index'
const pc = new Pinecone({ apiKey: PINECONE_API_KEY ?? '' })

export const data = new SlashCommandBuilder()
  .setName('indexfaq')
  .setDescription('Index the FAQ in Pinecone')

export async function execute(interaction: ChatInputCommandInteraction) {
  logger.command(interaction)

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const threads = interaction.client.faqManager.threads
  const threadsData = await Promise.all(
    threads.map(async thread => {
      const firstMessage = await thread.fetchStarterMessage()

      return {
        id: thread.id,
        name: thread.name,
        createdAt: thread.createdAt?.toISOString(),
        content: firstMessage?.content ?? '',
        tags: thread.appliedTags,
      }
    })
  )

  const index = pc.index(INDEX_NAME).namespace('en')
  const entries = threadsData.map(entry => ({
    id: `entry#${entry.id}`,
    chunk_text: entry.content,
    entry_name: entry.name,
    entry_date: entry.createdAt ?? '',
  }))
  const count = entries.length

  while (entries.length) {
    const batch = entries.splice(0, 90)
    await index.upsertRecords(batch)
  }

  await interaction.editReply({
    content: `Indexed ${count} entries into Pinecone.`,
  })
}
