import { REST, Routes } from 'discord.js'

import { DISCORD_TOKEN, DISCORD_CLIENT_ID } from '../constants/config'
import { DISCORD_SERVER_ID, TEST_SERVER_ID } from '../constants/discord'
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
    console.log('[Discord] Deploying bot commands', { guildId })
    await rest.put(endpoint, { body })
    console.log('[Discord] Successfully deployed bot commands', { guildId })
  } catch (error) {
    console.error('[Discord] Failed to deploy bot commands', { guildId }, error)
  }
}

export async function deployCommand(guildId: string, commandName: string) {
  const endpoint = Routes.applicationGuildCommands(DISCORD_CLIENT_ID, guildId)
  const [body] = Object.values(commands)
    .filter(command => command.data.name === commandName)
    .map(command => command.data)

  try {
    console.log('[Discord] Deploying bot command', { guildId, commandName })
    await rest.post(endpoint, { body })
    console.log('[Discord] Successfully deployed bot command', {
      guildId,
      commandName,
    })
  } catch (error) {
    console.error('[Discord] Failed to deploy bot command', {
      guildId,
      commandName,
      error,
    })
  }
}

export async function deleteCommands(guildId: string) {
  const endpoint = Routes.applicationGuildCommands(DISCORD_CLIENT_ID, guildId)

  try {
    console.log('[Discord] Deleting bot commands for guild', { guildId })
    await rest.put(endpoint, { body: [] })
    console.log('[Discord] Successfully deleted bot commands for guild', {
      guildId,
    })
  } catch (error) {
    console.error('[Discord] Failed to delete bot commands for guild', {
      guildId,
      error,
    })
  }
}

export async function deleteCommand(guildId: string, commandId: string) {
  const endpoint = Routes.applicationGuildCommand(
    DISCORD_CLIENT_ID,
    guildId,
    commandId
  )

  try {
    console.log('[Discord] Deleting bot command for guild', {
      guildId,
      commandId,
    })
    await rest.delete(endpoint)
    console.log('[Discord] Successfully deleted bot command for guild', {
      guildId,
      commandId,
    })
  } catch (error) {
    console.error('[Discord] Failed to delete bot command for guild', {
      guildId,
      commandId,
      error,
    })
  }
}
