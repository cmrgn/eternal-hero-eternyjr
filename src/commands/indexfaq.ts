import {
  type AnyThreadChannel,
  type ChatInputCommandInteraction,
  ForumChannel,
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

function getThreadTags(thread: AnyThreadChannel) {
  if (!(thread.parent instanceof ForumChannel)) {
    return []
  }

  return thread.appliedTags
    .map(
      id =>
        (thread.parent as ForumChannel).availableTags.find(pt => pt.id === id)
          ?.name ?? ''
    )
    .filter(Boolean)
}

export type PineconeEntry = {
  id: string
  chunk_text: string
  entry_question: string
  entry_answer: string
  entry_tags: string[]
  entry_date: string
}

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
        tags: getThreadTags(thread),
      }
    })
  )

  const index = pc.index(INDEX_NAME).namespace('en')
  const entries: PineconeEntry[] = threadsData
    .filter(entry => entry.content)
    .map(entry => ({
      id: `entry#${entry.id}`,
      chunk_text: `${entry.name}\n\n${entry.content}`,
      entry_question: entry.name,
      entry_answer: entry.content,
      entry_date: entry.createdAt ?? '',
      entry_tags: entry.tags,
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
