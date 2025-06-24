import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'

import { logger } from '../utils/logger'
import { LOCALES } from '../constants/i18n'
import pMap from 'p-map'

export const scope = 'OFFICIAL'

export const data = new SlashCommandBuilder()
  .setName('indexfaq')
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
  .setDescription('Index the FAQ in Pinecone')

export async function execute(interaction: ChatInputCommandInteraction) {
  logger.command(interaction)

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const language = interaction.options.getString('language') ?? 'en'
  const { faqManager, searchManager, localizationManager } = interaction.client
  const { threads } = faqManager

  // Retrive the content for every thread in the FAQ
  let threadsWithContent = await Promise.all(
    threads.map(faqManager.resolveThread)
  )

  if (language !== 'en') {
    threadsWithContent = await pMap(
      threadsWithContent,
      async thread => localizationManager.translateFAQEntry(thread, language),
      { concurrency: 2 }
    )
  }

  // Format the content for Pinecone indexation
  const entries = threadsWithContent
    .filter(entry => entry.content)
    .map(searchManager.prepareForIndexing)
  const count = entries.length

  // Index all the threads into Pinecone
  await searchManager.indexRecords(entries, language)

  // Acknowledge the indexation
  await interaction.editReply({
    content: `Indexed ${count} entries into Pinecone.`,
  })
}
