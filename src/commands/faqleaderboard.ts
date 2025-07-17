import {
  type ChatInputCommandInteraction,
  InteractionContextType,
  SlashCommandBuilder,
  userMention,
} from 'discord.js'
import { DiscordManager } from '../managers/DiscordManager'

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
  .setContexts(InteractionContextType.Guild)

export async function execute(interaction: ChatInputCommandInteraction) {
  const { guildId, client, options } = interaction
  const { Leaderboard, CommandLogger } = client.managers
  const size = options.getInteger('size') ?? 5

  if (!guildId) return

  CommandLogger.logCommand(interaction, 'Starting command execution')
  const leaderboard = await Leaderboard.getLeaderboard(guildId, size)

  const embed = DiscordManager.createEmbed().setTitle('FAQ Leaderboard')

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
