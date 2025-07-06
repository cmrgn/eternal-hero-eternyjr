import { Events } from 'discord.js'
import 'dotenv/config'

import { client } from './client'
import { onClientReady } from './events/clientReady'
import { onGuildCreate } from './events/guildCreate'
import { onMessageCreate } from './events/messageCreate'
import { onInteractionCreate } from './events/interactionCreate'

if (!process.env.DISCORD_TOKEN) {
  throw new Error('Missing environment variable DISCORD_TOKEN; aborting.')
}

client.login(process.env.DISCORD_TOKEN)
client.once(Events.ClientReady, onClientReady)
client.on(Events.GuildCreate, onGuildCreate(client))
client.on(Events.MessageCreate, onMessageCreate)
client.on(Events.InteractionCreate, onInteractionCreate)
