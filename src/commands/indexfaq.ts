import {
  type AnyThreadChannel,
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import pMap from 'p-map'

import { type CrowdinCode, LANGUAGE_OBJECTS } from '../constants/i18n'
import { logger } from '../utils/logger'
import { IndexManager, type PineconeEntry } from '../managers/IndexManager'

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

  .addSubcommand(subcommand =>
    subcommand.setName('deepl').setDescription('Update glossary on DeepL')
  )

  .addSubcommand(subcommand =>
    subcommand.setName('stats').setDescription('Provide general about the FAQ')
  )

  .setDescription('Index the FAQ in Pinecone')

async function fetchFAQContent(interaction: ChatInputCommandInteraction) {
  logger.logCommand(interaction, 'Fetching FAQ content')

  const { client, options } = interaction
  const { Faq } = client.managers
  const threadId = options.getString('thread_id')

  if (threadId) {
    await interaction.editReply(`Fetching thread with ID \`${threadId}\`…`)
    const thread = (await client.channels.fetch(threadId)) as AnyThreadChannel

    return [await Faq.resolveThread(thread)]
  }

  await interaction.editReply('Loading all FAQ threads…')
  return Promise.all(Faq.threads.map(thread => Faq.resolveThread(thread)))
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

  if (interaction.options.getSubcommand() === 'deepl') {
    return commandDeepl(interaction)
  }

  if (interaction.options.getSubcommand() === 'stats') {
    return commandStats(interaction)
  }
}

async function commandThread(interaction: ChatInputCommandInteraction) {
  const { options, client } = interaction
  const { Faq, Crowdin, Index, Discord } = client.managers
  const threadId = options.getString('thread_id', true)
  const crowdinCode = options.getString('language') as CrowdinCode | undefined
  const thread = (await client.channels.fetch(threadId)) as AnyThreadChannel

  await interaction.editReply(`Loading thread with ID \`${threadId}\`…`)
  const resolvedThread = await Faq.resolveThread(thread)

  function onIndexFailure(error: unknown) {
    return Discord.sendInteractionAlert(
      interaction,
      `Could not index “${resolvedThread.name}” (\`${resolvedThread.id}\`) in namespace ${crowdinCode}, even after several attempts.
      \`\`\`${error}\`\`\``
    )
  }

  if (crowdinCode) {
    try {
      const languageObject = LANGUAGE_OBJECTS.find(
        languageObject => languageObject.crowdinCode === crowdinCode
      )

      if (!languageObject) {
        throw new Error(`Could not retrieve language object for ${crowdinCode}`)
      }

      await interaction.editReply(
        `Indexing thread with ID \`${threadId}\` in namespace \`${crowdinCode}\`…`
      )
      await Index.translateAndIndexThread(resolvedThread, languageObject)
    } catch (error) {
      await onIndexFailure(error)
    }
  } else {
    await interaction.editReply('Indexing thread in all languages…')

    await Crowdin.onCrowdinLanguages(async (languageObject, i, languages) => {
      const progress = Math.round(((i + 1) / languages.length) * 100)
      try {
        await interaction.editReply({
          content: [
            `Indexing thread with ID \`${threadId}\` in progress…`,
            `- Namespace: \`${languageObject.crowdinCode}\``,
            `- Progress: ${progress}%`,
            `- Thread: _“${resolvedThread.name}”_`,
          ].join('\n'),
        })
        await Index.translateAndIndexThread(resolvedThread, languageObject)
      } catch (error) {
        await onIndexFailure(error)
      }
    })
  }

  return interaction.editReply(
    `Finished indexing thread with ID \`${threadId}\`.`
  )
}

async function commandLanguage(interaction: ChatInputCommandInteraction) {
  const { options, client } = interaction
  const { Index, Discord } = client.managers
  const crowdinCode = options.getString('language', true)
  const threadsWithContent = await fetchFAQContent(interaction)
  const total = threadsWithContent.length
  const languageObject = LANGUAGE_OBJECTS.find(
    languageObject => languageObject.crowdinCode === crowdinCode
  )
  const discordEditLimiter = Discord.getDiscordEditLimiter()

  if (!languageObject) {
    throw new Error(`Could not retrieve language object for ${crowdinCode}`)
  }

  // This function is responsible for reporting the current progress by editing
  // the original message while respecting Discord’s rate limits
  const notify = discordEditLimiter.wrap(
    (thread: (typeof threadsWithContent)[number], index: number) =>
      interaction.editReply({
        content: [
          'Indexing in progress…',
          `- Namespace: \`${crowdinCode}\``,
          `- Progress: ${Math.round(((index + 1) / total) * 100)}%`,
          `- Current: _“${thread.name}”_`,
        ].join('\n'),
      })
  )

  // When indexing the English FAQ, there is no need for translation which is
  // why the whole concurrency exists in the first place. It can safely be done
  // in a single action (which will be batched in the manager to respect
  // Pinecone’s limits).
  if (crowdinCode === 'en') {
    await interaction.editReply('Indexing all FAQ threads…')
    await Index.indexRecords(
      threadsWithContent.reduce<PineconeEntry[]>(
        (records, thread) =>
          records.concat(IndexManager.prepareForIndexing(thread)),
        []
      ),
      crowdinCode
    )
  }

  // Iterate over all threads with the given concurrency, and for each thread,
  // translate it if the expected language is not English, and upsert it into
  // the relevant Pinecone namespace
  else {
    logger.logCommand(interaction, 'Processing all threads')

    await interaction.editReply('Indexing all FAQ threads…')
    await pMap(
      threadsWithContent.entries(),
      async ([i, thread]) => {
        await notify(thread, i)
        await Index.translateAndIndexThread(thread, languageObject)
      },
      { concurrency: 25 } // DeepL has a 30 RPS limit
    )
  }

  return interaction.editReply({
    content: `Finished indexing **${total} thread${total === 1 ? '' : 's'}** in namespace \`${crowdinCode}\`.`,
  })
}

async function commandDeepl(interaction: ChatInputCommandInteraction) {
  const { client } = interaction
  const { DeepL, Crowdin } = client.managers
  const files = await Crowdin.fetchAllProjectTranslations()
  const translations = await Crowdin.extractTranslationsFromFiles(files)

  await Crowdin.onCrowdinLanguages(
    async ({ twoLettersCode: targetLangCode }) => {
      await interaction.editReply({
        content: `Updating the DeepL glossary for ‘${targetLangCode}’.`,
      })
      await DeepL.updateDeepLGlossary(translations, targetLangCode)
    },
    { withEnglish: false }
  )

  return interaction.editReply({ content: 'Updated the DeepL glossary.' })
}

async function commandStats(interaction: ChatInputCommandInteraction) {
  const { client } = interaction
  const { Faq, Crowdin, DeepL, Index } = client.managers
  const languageObjects = Crowdin.getLanguages({ withEnglish: false })
  const threads = await fetchFAQContent(interaction)
  const wordCount = threads.reduce(
    (acc, thread) => acc + thread.content.trim().split(/\s+/).length,
    0
  )
  const charCount = threads.reduce(
    (acc, thread) => acc + thread.content.trim().length,
    0
  )
  const { character: charUsed } = await DeepL.getUsage()
  const pcUsage = await Index.index.describeIndexStats()

  const totalRecordCounts = Object.entries(pcUsage.namespaces ?? {}).reduce(
    (acc, [name, data]) =>
      acc + (name.startsWith('test-') ? 0 : data.recordCount),
    0
  )
  const numberFormatter = new Intl.NumberFormat('en-US')
  const nf = numberFormatter.format
  const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
  })
  const cf = currencyFormatter.format

  const costPerChar = DeepL.COST_PER_CHAR
  const entryCount = Faq.threads.length
  const languageCount = languageObjects.length
  const avgCharPerEntry = charCount / entryCount
  const totalChar = charCount * languageCount

  const content = `
### Original version:
- Entry count: ${entryCount}
- Word count: ${nf(wordCount)}
- Character count: ${nf(charCount)}
- Average character count per entry: ${nf(Math.round(avgCharPerEntry))}
### Localized versions:
- Language count: ${languageCount} (w/o English)
- Total word count: ${nf(wordCount * languageCount)}
- Total character count: ${nf(totalChar)}
### DeepL:
- DeepL rate: ${cf(20)} per ${nf(1_000_000)} characters
- Cost to index 1 entry: ${cf(costPerChar * avgCharPerEntry * languageCount)}
- Cost to index 1 localized version: ${cf(costPerChar * charCount)}
- Cost to index all localized versions: ${cf(costPerChar * totalChar)}
- Current usage: ${nf(charUsed)} characters (${cf(costPerChar * charUsed)})
### Pinecone:
- Dimension: ${nf(pcUsage.dimension ?? 0)}
- Record count: ${nf(totalRecordCounts)}
  `

  return interaction.editReply({ content })
}
