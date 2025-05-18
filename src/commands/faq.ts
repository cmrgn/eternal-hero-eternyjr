import {
  type AnyThreadChannel,
  type ChatInputCommandInteraction,
  type CommandInteraction,
  EmbedBuilder,
  type ForumChannel,
  SlashCommandBuilder,
} from 'discord.js'
import Fuse from 'fuse.js'
import { LRUCache } from 'lru-cache'

const FAQ_FORUM_NAME = '❓│faq-guide'

export const data = new SlashCommandBuilder()
  .setName('faq')
  .addStringOption(option =>
    option
      .setName('keyword')
      .setDescription('The search keyword')
      .setRequired(true)
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

  await interaction.deferReply()

  const threads = await getThreads(interaction)
  const fuse = new Fuse(threads, {
    includeScore: true,
    ignoreDiacritics: true,
    keys: ['name'],
    minMatchCharLength: 3,
    threshold: 0.5,
  })

  const keyword = interaction.options.getString('keyword') ?? ''
  const results = fuse.search(keyword)
  const embed = new EmbedBuilder()
    .setTitle('FAQ search')
    .setColor('#E95C4E')
    .setThumbnail('https://ehmb.netlify.app/eh_icon.png')
    .setTimestamp()

  if (results.length === 0) {
    embed.setDescription(
      `Your search for “${keyword}” yielded no results. Try a more generic term, or reach out to Kitty if you think this is a mistake.`
    )
  } else {
    console.log({
      keyword,
      results: results.map(result => ({
        name: result.item.name,
        score: result.score,
      })),
    })

    embed
      .setDescription(
        `Your search for “${keyword}” yielded the following results:`
      )
      .addFields(
        results.map(result => ({
          name: result.item.name,
          value: result.item.url,
        }))
      )
  }

  return interaction.editReply({ embeds: [embed] })
}
