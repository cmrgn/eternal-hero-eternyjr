import {
  type ChatInputCommandInteraction,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js'
import { logger } from '../utils/logger'
import { DISCORD_CLIENT_ID, DISCORD_TOKEN } from '../config'

export const data = new SlashCommandBuilder()
  .setName('reload')
  .setDescription('Reload bot command definitions')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN)

export async function execute(interaction: ChatInputCommandInteraction) {
  const { guildId, client } = interaction

  logger.command(interaction)

  if (!guildId) {
    throw new Error('Cannot find guild ID on interaction.')
  }

  // This does not use the `deployCommand` util because it would cause a circu-
  // lar dependency when getting bundled. It also doesn’t need the logs from
  // that utility since it already uses the loader.
  const endpoint = Routes.applicationGuildCommands(DISCORD_CLIENT_ID, guildId)
  const body = Object.values(client.commands).map(command => command.data)
  await rest.put(endpoint, { body })

  await interaction.reply({
    content: 'Bot command definitions successfully reloaded.',
    flags: MessageFlags.Ephemeral,
  })
}
