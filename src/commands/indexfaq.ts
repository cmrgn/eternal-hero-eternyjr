import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import pMap from 'p-map'
import Bottleneck from 'bottleneck'

import type { ResolvedThread } from '../managers/FAQManager'
import { logger } from '../utils/logger'
import { type CrowdinCode, LANGUAGE_OBJECTS } from '../constants/i18n'
import { sendAlert } from '../utils/sendAlert'

export const scope = 'OFFICIAL'

export const data = new SlashCommandBuilder()
  .setName('indexfaq')
  .addStringOption(option =>
    option
      .setName('language')
      .setDescription('Translation language')
      .setChoices(
        Object.values(LANGUAGE_OBJECTS)
          .filter(
            languageObject =>
              languageObject.isOnCrowdin || languageObject.crowdinCode === 'en'
          )
          .map(languageObject => ({
            name: languageObject.languageName,
            value: languageObject.crowdinCode,
          }))
      )
  )
  .setDescription('Index the FAQ in Pinecone')

const discordEditLimiter = new Bottleneck({
  reservoir: 5, // Allow 5 calls
  reservoirRefreshAmount: 5, // Refill to 5
  reservoirRefreshInterval: 5000, // Every 5 seconds
})

async function fetchTranslationsIfNeeded(
  interaction: ChatInputCommandInteraction
) {
  const crowdinCode = (interaction.options.getString('language') ??
    'en') as CrowdinCode

  if (crowdinCode === 'en') return []

  logger.command(interaction, 'Fetching translations from Crowdin', {
    language: crowdinCode,
  })

  await interaction.editReply('Fetching translations from Crowdin…')

  // The reason we don’t fetch only the translations for the specific language
  // is that it’s not the way Crowdin works: to get all translations, you need
  // to build and download the project which comes as bunch of CSV files with
  // all the translations for all the languages in them.
  return interaction.client.crowdinManager.fetchAllProjectTranslations()
}

async function fetchFAQContent(interaction: ChatInputCommandInteraction) {
  logger.command(interaction, 'Fetching FAQ content')

  const { faqManager } = interaction.client

  await interaction.editReply('Loading all FAQ threads…')

  return Promise.all(
    faqManager.threads.map(thread => faqManager.resolveThread(thread))
  )
}

export async function execute(interaction: ChatInputCommandInteraction) {
  logger.command(interaction, 'Starting command execution')

  // This command can take a long time, so it needs to be handled asynchronously
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const { client, options } = interaction
  const { indexationManager } = client
  const crowdinCode = (options.getString('language') ?? 'en') as CrowdinCode
  const translations = await fetchTranslationsIfNeeded(interaction)
  const threadsWithContent = await fetchFAQContent(interaction)
  const total = threadsWithContent.length

  // This function is responsible for reporting the current progress by editing
  // the original message while respecting Discord’s rate limits
  const notify = discordEditLimiter.wrap(
    (thread: ResolvedThread, index: number) =>
      interaction.editReply({
        content: `Indexing (${index + 1}/${total}) _“${thread.name}”_ in namespace \`${crowdinCode}\`.`,
      })
  )

  // If ChatGPT fails to translate something, report it in the #alert channels
  // of the test server to debug it
  const onTranslationFailure = (thread: ResolvedThread, reason: string) =>
    sendAlert(
      interaction,
      `ChatGPT failed to translate thread “${thread.name}” (${thread.id}) into ${crowdinCode}.
      > ${reason.replace(/\n/g, '\n> ')}`
    )

  // If the indexation fails for any reason despite the exponential backoff
  // retries, report it in the #alert channels of the test server to debug it
  const onIndexationFailure = (thread: ResolvedThread, error: unknown) =>
    sendAlert(
      interaction,
      `Could not index “${thread.name}” (${thread.id}) in namespace ${crowdinCode}, even after several attempts.
      \`\`\`${error}\`\`\``
    )

  // Iterate over all threads with the given concurrency, and for each thread,
  // translate it if the expected language is not English, and upsert it into
  // the relevant Pinecone namespace
  logger.command(interaction, 'Processing all threads')
  await pMap(
    threadsWithContent.entries(),
    async ([index, thread]) => {
      const events = {
        onThread: (thread: ResolvedThread) => notify(thread, index),
        onTranslationFailure,
      }

      const translateAndIndex = indexationManager.threadIndexer(
        crowdinCode,
        translations,
        { events }
      )

      try {
        await translateAndIndex(thread)
      } catch (error) {
        await onIndexationFailure(thread, error)
      }
    },
    { concurrency: 3 }
  )

  return interaction.editReply({
    content: `Finished indexing **${total} threads** in namespace \`${crowdinCode}\`.`,
  })
}
