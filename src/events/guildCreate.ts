import type { Client, Guild } from 'discord.js'

import { IS_DEV } from '../constants/config'

export function onGuildCreate(client: Client) {
  const { Discord } = client.managers

  return (guild: Guild) => {
    // The local bot should never react to adding the bot to other servers, since
    // the production bot already does that, and we don’t want to duplicate all
    // the commands.
    if (IS_DEV) return

    // Deploy the commands for the guild (Discord server) when adding the bot to
    // said Discord server.
    return Discord.deployCommands(guild.id)
  }
}
