import type { Guild } from 'discord.js'
import { deleteCommands } from '../utils/commands'

export function onGuildDelete(guild: Guild) {
  // Remove the commands for the guild (Discord server) when removing the bot
  // from said Discord server.
  return deleteCommands(guild.id)
}
