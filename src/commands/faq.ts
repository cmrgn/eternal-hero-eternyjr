import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
  userMention,
} from 'discord.js'

import { logger } from '../utils/logger'
import { createEmbed } from '../utils/createEmbed'
import { KITTY_USER_ID } from '../constants/discord'
import { sendAlert } from '../utils/sendAlert'

export const scope = 'PUBLIC'

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
  .addUserOption(option =>
    option.setName('user').setDescription('User to mention')
  )
  .setDescription('Search the FAQ')

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction) throw new Error('Could not retrieve guild.')

  const { client, guildId, channelId, member, options } = interaction

  const visible = options.getBoolean('visible') ?? false
  const user = options.getUser('user')
  const keyword = options.getString('keyword', true)

  const embed = createEmbed().setTitle(`FAQ search: “${keyword}”`)
  const search = client.searchManager.searchThreads(keyword)

  if (search.results.length > 0) {
    if (search.keyword !== keyword) {
      embed.setDescription(
        `Your search for “${keyword}” yielded no results, but it seems related to _${search.keyword}_.`
      )
    }

    embed.addFields(
      search.results.map(({ item }) => ({ name: item.name, value: item.url }))
    )

    logger.command(interaction, {
      results: search.results.map(({ item, score }) => ({
        name: item.name,
        score,
      })),
    })

    if (visible && member && guildId) {
      const userId = member.user.id
      client.leaderboardManager.register({ userId, channelId, guildId })
    }
  } else {
    await sendAlert(
      interaction,
      `A search for _“${keyword}”_ yielded no results. If it’s unexpected, we may want to improve it with assigning that keyword (or something similar) to a specific search term.`
    )
    embed.setDescription(
      `Your search for “${keyword}” yielded no results. Try a more generic term, or reach out to ${userMention(KITTY_USER_ID)} if you think this is a mistake.`
    )
  }

  return interaction.reply({
    flags: visible || user ? undefined : MessageFlags.Ephemeral,
    content: user ? userMention(user.id) : undefined,
    embeds: [embed],
  })
}
