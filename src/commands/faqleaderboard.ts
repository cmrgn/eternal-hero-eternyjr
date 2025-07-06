import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
  userMention,
} from 'discord.js'

import { logger } from '../utils/logger'

export const scope = 'PUBLIC'

export const data = new SlashCommandBuilder()
  .setName('faqleaderboard')
  .addIntegerOption(option =>
    option
      .setName('size')
      .setDescription('Amount of people to display')
      .setMinValue(1)
      .setMaxValue(20)
  )
  .setDescription('Display the FAQ leaderboard')

export async function execute(interaction: ChatInputCommandInteraction) {
  logger.logCommand(interaction, 'Starting command execution')

  const { guildId, client, options } = interaction
  const { Leaderboard, Discord } = client.managers
  const size = options.getInteger('size') ?? 5

  if (!guildId) return

  logger.logCommand(interaction, 'Retrieving leaderboard data')
  const leaderboard = await Leaderboard.getLeaderboard(guildId, size)

  const embed = Discord.createEmbed().setTitle('FAQ Leaderboard')

  if (leaderboard.length === 0) {
    embed.setDescription('The FAQ leaderboard is currently empty.')
  } else {
    embed.setDescription(
      leaderboard
        .map(
          (entry, index) =>
            `${index + 1}. ${userMention(entry.user_id)}: ${entry.contribution_count} link${entry.contribution_count === 1 ? '' : 's'}`
        )
        .join('\n')
    )
  }

  await interaction.reply({ embeds: [embed] })
}
