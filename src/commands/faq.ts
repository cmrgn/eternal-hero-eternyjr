import {
  type CommandInteraction,
  EmbedBuilder,
  type ForumChannel,
  SlashCommandBuilder,
} from 'discord.js'
import Fuse from 'fuse.js'

const FAQ_FORUM_NAME = 'faq-guide'

export const data = new SlashCommandBuilder()
  .setName('faq')
  .addStringOption(option =>
    option
      .setName('input')
      .setDescription('The search keyword')
      .setRequired(true)
  )
  .setDescription('Search the FAQ')

export async function execute(interaction: CommandInteraction) {
  if (!interaction.guild) {
    throw new Error('Could not retrieve guild.')
  }

  const faq = interaction.guild.channels.cache.find(
    channel => channel.name === FAQ_FORUM_NAME
  ) as ForumChannel
  const threadList = await faq.threads.fetch()
  const threads = Array.from(threadList.threads.values())
  const fuse = new Fuse(threads, {
    includeScore: true,
    keys: ['name'],
  })

  // @ts-ignore
  const input = interaction.options.getString('input')
  const results = fuse.search(input)
  const embed = new EmbedBuilder()
    .setTitle('FAQ search')
    .setThumbnail('https://ehmb.netlify.app/eh_icon.png')
    .setTimestamp()

  if (results.length === 0) {
    embed.setDescription(
      `Your search for “${input}” yielded no results. Try a more generic term, or reach out to Kitty if you think this is a mistake.`
    )
  } else {
    embed
      .setDescription(
        `Your search for “${input}” yielded the following results:`
      )
      .addFields(
        results.map(result => ({
          name: result.item.name,
          value: result.item.url,
        }))
      )
  }

  return interaction.reply({ embeds: [embed] })
}
