import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
  userMention,
} from 'discord.js'
import { logger } from '../utils/logger'
import { pool } from '../utils/pg'
import { createEmbed } from '../utils/create-embed'

export const data = new SlashCommandBuilder()
  .setName('faqleaderboard')
  .setDescription('Display the FAQ leaderboard')

export async function upsertContribution(
  userId: string,
  guildId: string,
  increment = 1
) {
  try {
    await pool.query(
      `
      INSERT INTO faq_leaderboard (guild_id, user_id, contribution_count)
      VALUES ($1, $2, $3)
      ON CONFLICT (guild_id, user_id)
      DO UPDATE SET contribution_count = faq_leaderboard.contribution_count + $3
      `,
      [guildId, userId, increment]
    )
    console.log(`Upserted and incremented count for user ${userId}`)
  } catch (error) {
    console.error(`Failed to upsert and increment count for user ${userId}`)
  }
}

async function getLeaderboard(guildId: string, limit: number) {
  const { rows } = await pool.query(
    `
    SELECT user_id, contribution_count
    FROM faq_leaderboard
    WHERE guild_id = $1
    ORDER BY contribution_count DESC
    LIMIT $2
    `,
    [guildId, limit]
  )

  return rows
}

export async function execute(interaction: ChatInputCommandInteraction) {
  logger.command(interaction)

  if (!interaction.guildId) return

  const leaderboard = await getLeaderboard(interaction.guildId, 5)
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
