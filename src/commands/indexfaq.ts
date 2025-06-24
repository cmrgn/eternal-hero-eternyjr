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
import { withRetries } from '../utils/withRetries'
import { sendAlert } from '../utils/sendAlert'
import type { LocalizationItem } from '../utils/LocalizationManager'

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

export async function execute(interaction: ChatInputCommandInteraction) {
  logger.command(interaction)

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const language = interaction.options.getString('language') ?? 'en'
  const { faqManager, searchManager, localizationManager } = interaction.client
  const namespace = 'test' // language // Replace with whatever else for testing
  let translations: LocalizationItem[] = []

  // The reason we don’t fetch only the translations for the specific language
  // is that it’s not the way Crowdin works: to get all translations, you need
  // to build and download the project which comes as bunch of CSV files with
  // all the translations for all the languages in them.
  if (language !== 'en') {
    await interaction.editReply('Fetching translations from Crowdin…')
    translations = await localizationManager.fetchAllProjectTranslations()
  }

  // Retrive the content for every thread in the FAQ
  await interaction.editReply('Loading all FAQ threads…')
  const threadsWithContent = await Promise.all(
    faqManager.threads.map(thread => faqManager.resolveThread(thread))
  )
  const total = threadsWithContent.length

  const notify = discordEditLimiter.wrap(
    (thread: ResolvedThread, index: number) =>
      interaction.editReply({
        content: `Indexing (${index + 1}/${total}) _“${thread.name}”_ in namespace \`${namespace}\`.`,
      })
  )

  async function indexThread(thread: ResolvedThread) {
    const localizedThread =
      language !== 'en'
        ? await localizationManager.translateThread(
            thread,
            language,
            translations
          )
        : thread
    if (localizedThread)
      await searchManager.indexThread(localizedThread, namespace)
  }

  async function safeIndexThread([index, thread]: [number, ResolvedThread]) {
    const retryOptions = { retries: 5, backoffMs: 3000, label: thread.name }
    try {
      await withRetries(async () => {
        await notify(thread, index)
        await indexThread(thread)
      }, retryOptions)
    } catch (error) {
      await sendAlert(
        interaction,
        `Could not index “${thread.name}” (${thread.id}) in namespace ${namespace}, even after several attempts.
        \`\`\`${error}\`\`\``
      )
    }
  }

  // Iterate over all threads with the given concurrency, and for each thread,
  // translate it if the expected language is not English, and upsert it into
  // the relevant Pinecone namespace
  await pMap(threadsWithContent.entries(), safeIndexThread, { concurrency: 3 })

  // Acknowledge the indexation
  return interaction.editReply({
    content: `Finished indexing **${total} threads** in namespace \`${namespace}\`.`,
  })
}
