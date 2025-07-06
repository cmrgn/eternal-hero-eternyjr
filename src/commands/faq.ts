import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
  userMention,
} from 'discord.js'

import { logger } from '../utils/logger'
import { createEmbed } from '../utils/createEmbed'
import { KITTY_USER_ID } from '../constants/discord'
import { sendInteractionAlert } from '../utils/sendInteractionAlert'
import type { SearchType } from '../managers/SearchManager'

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
  .addStringOption(option =>
    option
      .setName('method')
      .setDescription('Search method')
      .addChoices(
        { name: 'Fuzzy', value: 'FUZZY' },
        { name: 'Vector', value: 'VECTOR' }
      )
  )
  .setDescription('Search the FAQ')

export async function execute(interaction: ChatInputCommandInteraction) {
  logger.logCommand(interaction, 'Starting command execution')

  const { client, guildId, channelId, member, options } = interaction
  const { Search, Leaderboard } = client.managers
  const visible = options.getBoolean('visible') ?? false
  const user = options.getUser('user')
  const keyword = options.getString('keyword', true)
  const method = (options.getString('method') ?? 'FUZZY') as SearchType
  const embed = createEmbed().setTitle(`FAQ search: “${keyword}”`)

  logger.logCommand(interaction, 'Performing search')
  const { query, results } = await Search.search(keyword, method, 'en', 5)

  if (results.length > 0) {
    if (method === 'FUZZY' && query !== keyword) {
      embed.setDescription(
        `Your search for “${keyword}” yielded no results, but it seems related to _${query}_.`
      )
    }

    embed.addFields(
      results.map(result => ({
        name: result.fields.entry_question,
        value: result.fields.entry_url,
      }))
    )

    logger.logCommand(interaction, 'Reporting search results', {
      results: results.map(result => ({
        name: result.fields.entry_question,
        score: result._score,
      })),
    })

    if (visible && member && guildId) {
      const userId = member.user.id
      logger.logCommand(interaction, 'Recording contribution')
      await Leaderboard.register({ userId, channelId, guildId })
    }
  } else {
    const message = `A ${method.toLowerCase()} search for _“${keyword}”_ yielded no results.`
    logger.logCommand(interaction, 'Sending empty search alert')
    await sendInteractionAlert(
      interaction,
      method === 'VECTOR'
        ? message
        : `${message} If it’s unexpected, we may want to improve it with assigning that keyword (or something similar) to a specific search term.`
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
