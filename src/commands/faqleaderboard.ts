import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
  userMention,
} from 'discord.js'
import { logger } from '../utils/logger'
import { createEmbed } from '../utils/createEmbed'

export const data = new SlashCommandBuilder()
  .setName('faqleaderboard')
  .setDescription('Display the FAQ leaderboard')

export async function execute(interaction: ChatInputCommandInteraction) {
  logger.command(interaction)

  const { guildId, client } = interaction

  if (!guildId) return

  const leaderboard = await client.leaderboardManager.getLeaderboard(guildId, 5)
  const embed = createEmbed().setTitle('FAQ Leaderboard')

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
