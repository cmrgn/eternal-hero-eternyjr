import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import Fuse from 'fuse.js'
import { logger } from '../utils/logger'
import { createEmbed } from '../utils/create-embed'
import { upsertContribution } from './faqleaderboard'

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

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) throw new Error('Could not retrieve guild.')

  const visible = interaction.options.getBoolean('visible') ?? false
  await interaction.deferReply({
    flags: visible ? undefined : MessageFlags.Ephemeral,
  })

  const { threads } = interaction.client.faqManager
  const fuse = new Fuse(threads, {
    includeScore: true,
    ignoreDiacritics: true,
    keys: ['name'],
    minMatchCharLength: 3,
    threshold: 0.3,
    ignoreLocation: true,
  })

  const keyword = interaction.options.getString('keyword', true)
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

    if (visible && interaction.member && interaction.guildId) {
      upsertContribution(interaction.member.user.id, interaction.guildId)
    }
  }

  return interaction.editReply({ embeds: [embed] })
}
