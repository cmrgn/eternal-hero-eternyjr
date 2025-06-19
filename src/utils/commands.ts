import { REST, Routes } from 'discord.js'

import {
  DISCORD_TOKEN,
  DISCORD_CLIENT_ID,
  DISCORD_SERVER_ID,
  TEST_SERVER_ID,
} from '../config'
import { commands } from '../commands'

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN)

export async function deployCommands(guildId: string) {
  const endpoint = Routes.applicationGuildCommands(DISCORD_CLIENT_ID, guildId)
  const body = Object.values(commands)
    .filter(
      command =>
        command.scope === 'PUBLIC' ||
        guildId === DISCORD_SERVER_ID ||
        guildId === TEST_SERVER_ID
    )
    .map(command => command.data)

  try {
    console.log('Reloading bot commands for guild', guildId)
    await rest.put(endpoint, { body })
    console.log('Successfully reloaded bot commands for guild', guildId)
  } catch (error) {
    console.error('Failed to reload bot commands for guild', guildId, error)
  }
}

export async function deleteCommands(guildId: string) {
  const endpoint = Routes.applicationGuildCommands(DISCORD_CLIENT_ID, guildId)

  try {
    console.log('Deleting bot commands for guild', guildId)
    await rest.put(endpoint, { body: [] })
    console.log('Successfully deleted bot commands for guild', guildId)
  } catch (error) {
    console.error('Failed to delete bot commands for guild', guildId, error)
  }
}
