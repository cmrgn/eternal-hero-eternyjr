import {
  type ChatInputCommandInteraction,
  type CommandInteraction,
  type ForumChannel,
  type Guild,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import Fuse from 'fuse.js'
import memoize from 'memoizee'
import ms from 'ms'
import { logger } from '../logger'
import { createEmbed } from '../utils'

const FAQ_FORUM_NAME = '❓│faq-guide'
const DISCORD_SERVER_ID = '1239215561649426453'

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

async function getFAQForum({ guild, guildId, client }: CommandInteraction) {
  // If running on the main Discord server, use the guild object from the inter-
  // action, otherwise fetch that guild object through the API.
  const isMainServer = guildId === DISCORD_SERVER_ID
  const { channels } = isMainServer
    ? (guild as Guild)
    : await client.guilds.fetch(DISCORD_SERVER_ID)
  const faq = channels.cache.find(channel => channel.name === FAQ_FORUM_NAME)

  return faq as ForumChannel
}

async function getThreads(interaction: CommandInteraction) {
  const faq = await getFAQForum(interaction)
  const [activeThreadRes, archivedThreadRes] = await Promise.all([
    faq.threads.fetchActive(),
    faq.threads.fetchArchived(),
  ])

  const activeThreads = Array.from(activeThreadRes.threads.values())
  const archivedThreads = Array.from(archivedThreadRes.threads.values())
  const threads = [...activeThreads, ...archivedThreads]

  logger.info('FETCH_THREADS', {
    active: activeThreads.length,
    archived: archivedThreads.length,
    total: threads.length,
  })

  return threads
}

function promisifiedGetThreads(
  interaction: CommandInteraction
): ReturnType<typeof getThreads> {
  return new Promise((resolve, reject) => {
    getThreads(interaction).then(resolve).catch(reject)
  })
}

const memoizedGetThreads = memoize(promisifiedGetThreads, {
  promise: true,
  maxAge: ms('1 hour'),
  normalizer: args => args[0].commandId,
})

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) throw new Error('Could not retrieve guild.')

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
  const embed = createEmbed().setTitle(`FAQ search: “${keyword}”`)

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

  return interaction.editReply({ embeds: [embed] })
}
