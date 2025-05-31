import { REST, Routes } from 'discord.js'
import { DISCORD_TOKEN, DISCORD_CLIENT_ID } from '../config'
import { commands } from '../commands'

export async function deployCommands(guildId: string) {
  const endpoint = Routes.applicationGuildCommands(DISCORD_CLIENT_ID, guildId)
  const body = Object.values(commands).map(command => command.data)
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN)

  try {
    console.log('Reloading bot commands for guild', guildId)
    await rest.put(endpoint, { body })
    console.log('Successfully reloaded bot commands for guild', guildId)
  } catch (error) {
    console.error('Failed to reload bot commands for guild', guildId, error)
  }
}
