import {
  type AnyThreadChannel,
  type ChatInputCommandInteraction,
  type CommandInteraction,
  EmbedBuilder,
  type ForumChannel,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import Fuse from 'fuse.js'
import memoize from 'memoizee'
import { logger } from '../logger'

const FAQ_FORUM_NAME = '❓│faq-guide'

export const data = new SlashCommandBuilder()
  .setName('faq')
  .addStringOption(option =>
    option
      .setName('keyword')
      .setDescription('The search keyword')
      .setRequired(true)
  )
  .addBooleanOption(option =>
    option
      .setName('visible')
      .setDescription('Whether it should show for everyone')
  )
  .setDescription('Search the FAQ')

function getThreads(
  interaction: CommandInteraction
): Promise<AnyThreadChannel[]> {
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const channels = interaction.guild!.channels
  const faq = channels.cache.find(
    channel => channel.name === FAQ_FORUM_NAME
  ) as ForumChannel

  return new Promise((resolve, reject) => {
    Promise.all([faq.threads.fetchActive(), faq.threads.fetchArchived()])
      .then(([activeThreadRes, archivedThreadRes]) => {
        const activeThreads = Array.from(activeThreadRes.threads.values())
        const archivedThreads = Array.from(archivedThreadRes.threads.values())
        const threads = [...activeThreads, ...archivedThreads]

        logger.info('FETCH_THREADS', {
          active: activeThreads.length,
          archived: archivedThreads.length,
          total: threads.length,
        })

        resolve(threads)
      })
      .catch(error => reject(error))
  })
}

const memoizedGetThreads = memoize(getThreads, {
  promise: true,
  maxAge: 60 * 60 * 1000,
  normalizer: args => args[0].commandId,
})

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    throw new Error('Could not retrieve guild.')
  }

  const visible = interaction.options.getBoolean('visible') ?? false
  await interaction.deferReply({
    flags: visible ? undefined : MessageFlags.Ephemeral,
  })

  const threads = await memoizedGetThreads(interaction)
  const fuse = new Fuse(threads, {
    includeScore: true,
    ignoreDiacritics: true,
    keys: ['name'],
    minMatchCharLength: 3,
    threshold: 0.3,
    ignoreLocation: true,
  })

  const keyword = interaction.options.getString('keyword') ?? ''
  const results = fuse
    .search(keyword)
    .filter(result => result.score && result.score <= 0.5)
  const embed = new EmbedBuilder()
    .setTitle(`FAQ search: “${keyword}”`)
    .setColor('#ac61ff')
    .setThumbnail('https://ehmb.netlify.app/eh_icon.png')
    .setTimestamp()

  logger.command(interaction, {
    results: results.map(result => ({
      name: result.item.name,
      score: result.score,
    })),
  })

  if (results.length === 0) {
    embed.setDescription(
      `Your search for “${keyword}” yielded no results. Try a more generic term, or reach out to Kitty if you think this is a mistake.`
    )
  } else {
    embed.addFields(
      results.map(result => ({
        name: result.item.name,
        value: result.item.url,
      }))
    )
  }

  return interaction.editReply({
    embeds: [embed],
  })
}
