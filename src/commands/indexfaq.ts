import {
  type AnyThreadChannel,
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import pMap from 'p-map'
import Bottleneck from 'bottleneck'

import type { ResolvedThread } from '../managers/FAQManager'
import { type CrowdinCode, LANGUAGE_OBJECTS } from '../constants/i18n'
import { logger } from '../utils/logger'
import { sendAlert } from '../utils/sendAlert'

export const scope = 'OFFICIAL'

const LANGUAGE_CHOICES = Object.values(LANGUAGE_OBJECTS)
  .filter(
    languageObject =>
      languageObject.isOnCrowdin || languageObject.crowdinCode === 'en'
  )
  .map(languageObject => ({
    name: languageObject.languageName,
    value: languageObject.crowdinCode,
  }))

export const data = new SlashCommandBuilder()
  .setName('index')

  .addSubcommand(subcommand =>
    subcommand
      .setName('language')
      .setDescription('Language to index the FAQ in')
      .addStringOption(option =>
        option
          .setName('language')
          .setDescription('Translation language')
          .setChoices(LANGUAGE_CHOICES)
          .setRequired(true)
      )
  )

  .addSubcommand(subcommand =>
    subcommand
      .setName('thread')
      .setDescription('Thread to index')
      .addStringOption(option =>
        option
          .setName('thread_id')
          .setDescription('Specific thread to index')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('language')
          .setDescription('Translation language')
          .setChoices(LANGUAGE_CHOICES)
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

  logger.logCommand(interaction, 'Fetching translations from Crowdin', {
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
  logger.logCommand(interaction, 'Fetching FAQ content')

  const { client, options } = interaction
  const { faqManager } = client
  const threadId = options.getString('thread_id')

  if (threadId) {
    await interaction.editReply(`Fetching thread with ID \`${threadId}\`…`)
    const thread = (await client.channels.fetch(threadId)) as AnyThreadChannel

    return [await faqManager.resolveThread(thread)]
  }

  await interaction.editReply('Loading all FAQ threads…')
  return Promise.all(
    faqManager.threads.map(thread => faqManager.resolveThread(thread))
  )
}

export async function execute(interaction: ChatInputCommandInteraction) {
  logger.logCommand(interaction, 'Starting command execution')

  // This command can take a long time, so it needs to be handled asynchronously
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  if (interaction.options.getSubcommand() === 'language') {
    return commandLanguage(interaction)
  }

  if (interaction.options.getSubcommand() === 'thread') {
    return commandThread(interaction)
  }
}

async function commandThread(interaction: ChatInputCommandInteraction) {
  const { options, client } = interaction
  const { faqManager, crowdinManager, indexationManager } = client
  const threadId = options.getString('thread_id', true)
  const crowdinCode = options.getString('language') as CrowdinCode | undefined
  const thread = (await client.channels.fetch(threadId)) as AnyThreadChannel

  await interaction.editReply(`Loading thread with ID \`${threadId}\`…`)
  const resolvedThread = await faqManager.resolveThread(thread)
  const translations = await fetchTranslationsIfNeeded(interaction)

  if (crowdinCode) {
    try {
      await interaction.editReply(
        `Indexing thread with ID \`${threadId}\` in namespace \`${crowdinCode}\`…`
      )
      await indexationManager.translateAndIndexThread(
        resolvedThread,
        crowdinCode,
        translations
      )
    } catch (error) {
      await onIndexationFailure(interaction, resolvedThread, error)
    }
  } else {
    await interaction.editReply('Indexing thread in all languages…')

    await crowdinManager.onCrowdinLanguages(
      async ({ crowdinCode }, index, languages) => {
        const progress = Math.round(((index + 1) / languages.length) * 100)
        try {
          await interaction.editReply({
            content: [
              `Indexing thread with ID \`${threadId}\` in progress…`,
              `- Namespace: \`${crowdinCode}\``,
              `- Progress: ${progress}%`,
              `- Thread: _“${resolvedThread.name}”_`,
            ].join('\n'),
          })
          await indexationManager.translateAndIndexThread(
            resolvedThread,
            crowdinCode,
            translations
          )
        } catch (error) {
          await onIndexationFailure(interaction, resolvedThread, error)
        }
      }
    )
  }

  return interaction.editReply(
    `Finished indexing thread with ID \`${threadId}\`.`
  )
}

async function commandLanguage(interaction: ChatInputCommandInteraction) {
  const { options, client } = interaction
  const { indexationManager } = client
  const crowdinCode = options.getString('language', true) as CrowdinCode
  const threadsWithContent = await fetchFAQContent(interaction)
  const total = threadsWithContent.length

  // This function is responsible for reporting the current progress by editing
  // the original message while respecting Discord’s rate limits
  const notify = discordEditLimiter.wrap(
    (thread: ResolvedThread, index: number) =>
      interaction.editReply({
        content: [
          'Indexing in progress…',
          `- Namespace: \`${crowdinCode}\``,
          `- Progress: ${Math.round(((index + 1) / total) * 100)}%`,
          `- Current: _“${thread.name}”_`,
        ].join('\n'),
      })
  )

  // When indexing the English FAQ, there is no need for translation via
  // ChatGPT, which is why the whole concurrency exists in the first place.
  // It can safely be done in a single action (which will be batched in the
  // manager to respect Pinecone’s limits.)
  if (crowdinCode === 'en') {
    await interaction.editReply('Indexing all FAQ threads…')
    await indexationManager.indexRecords(
      threadsWithContent.map(thread =>
        indexationManager.prepareForIndexing(thread)
      ),
      crowdinCode
    )
  }

  // Iterate over all threads with the given concurrency, and for each thread,
  // translate it if the expected language is not English, and upsert it into
  // the relevant Pinecone namespace
  else {
    logger.logCommand(interaction, 'Processing all threads')
    const translations = await fetchTranslationsIfNeeded(interaction)

    await interaction.editReply('Indexing all FAQ threads…')
    await pMap(
      threadsWithContent.entries(),
      async ([index, thread]) => {
        try {
          await notify(thread, index)
          await indexationManager.translateAndIndexThread(
            thread,
            crowdinCode,
            translations
          )
        } catch (error) {
          await onIndexationFailure(interaction, thread, error)
        }
      },
      { concurrency: 3 }
    )
  }

  return interaction.editReply({
    content: `Finished indexing **${total} thread${total === 1 ? '' : 's'}** in namespace \`${crowdinCode}\`.`,
  })
}

// If the indexation fails for any reason despite the exponential backoff
// retries, report it in the #alert channels of the test server to debug it
function onIndexationFailure(
  interaction: ChatInputCommandInteraction,
  thread: ResolvedThread,
  error: unknown
) {
  const crowdinCode = interaction.options.getString('language')

  return sendAlert(
    interaction,
    `Could not index “${thread.name}” (\`${thread.id}\`) in namespace ${crowdinCode}, even after several attempts.
      \`\`\`${error}\`\`\``
  )
}
