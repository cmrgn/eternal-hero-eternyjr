import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import pMap from 'p-map'
import Bottleneck from 'bottleneck'

import { logger } from '../utils/logger'
import { LOCALES } from '../constants/i18n'
import type { ResolvedThread } from '../utils/FAQManager'
import type { PineconeNamespace } from '../utils/SearchManager'

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

const discordEditLimiter = new Bottleneck({
  reservoir: 5, // Allow 5 calls
  reservoirRefreshAmount: 5, // Refill to 5
  reservoirRefreshInterval: 5000, // Every 5 seconds
})

const notify = discordEditLimiter.wrap(
  (
    interaction: ChatInputCommandInteraction,
    thread: ResolvedThread,
    namespace: PineconeNamespace
  ) =>
    interaction.editReply({
      content: `Indexing _“${thread.name}”_ in namespace \`${namespace}\`.`,
    })
)

export async function execute(interaction: ChatInputCommandInteraction) {
  logger.command(interaction)

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const language = interaction.options.getString('language') ?? 'en'
  const { faqManager, searchManager, localizationManager } = interaction.client
  const concurrency = 2
  const namespace = language // Replace with whatever else for testing

  // Retrive the content for every thread in the FAQ
  const threadsWithContent = await Promise.all(
    faqManager.threads.map(thread => faqManager.resolveThread(thread))
  )

  // Iterate over all threads with the given concurrency, and for each thread,
  // translate it if the expected language is not English, and upsert it into
  // the relevant Pinecone namespace
  await pMap(
    threadsWithContent,
    async thread => {
      await notify(interaction, thread, namespace)
      const localizedThread =
        language !== 'en'
          ? await localizationManager.translateFAQEntry(thread, language)
          : thread
      if (!localizedThread) return
      await searchManager.indexThread(localizedThread, namespace)
    },
    { concurrency }
  )

  // Acknowledge the indexation
  return interaction.editReply({
    content: `Finished indexing **${threadsWithContent.length} threads** in namespace \`${namespace}\`.`,
  })
}
