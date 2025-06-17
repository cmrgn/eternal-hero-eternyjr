import type { Guild } from 'discord.js'
import { deployCommands } from '../utils/commands'

export function onGuildCreate(guild: Guild) {
  // Deploy the commands for the guild (Discord server) when adding the bot to
  // said Discord server.
  return deployCommands(guild.id)
}
