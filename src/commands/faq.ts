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
import { LRUCache } from 'lru-cache'
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

const cache = new LRUCache({
  ttl: 1000 * 60 * 60, // Cache the threads for 1 hour
  ttlAutopurge: true,
})

const getThreads = async (interaction: CommandInteraction) => {
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const channels = interaction.guild!.channels
  const faq = channels.cache.find(
    channel => channel.name === FAQ_FORUM_NAME
  ) as ForumChannel

  if (!cache.has('__threads')) {
    const threadList = await faq.threads.fetch()
    const threads = Array.from(threadList.threads.values())
    cache.set('__threads', threads)
  }

  return cache.get('__threads') as AnyThreadChannel[]
}

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    throw new Error('Could not retrieve guild.')
  }

  const visible = interaction.options.getBoolean('visible') ?? false
  await interaction.deferReply({
    flags: visible ? undefined : MessageFlags.Ephemeral,
  })

  const threads = await getThreads(interaction)
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
