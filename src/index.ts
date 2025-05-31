import { Events } from 'discord.js'
import { client } from './client'
import { DISCORD_TOKEN } from './config'
import { onClientReady } from './events/clientReady'
import { onGuildCreate } from './events/guildCreate'
import { onMessageCreate } from './events/messageCreate'
import { onInteractionCreate } from './events/interactionCreate'

client.login(DISCORD_TOKEN)
client.once(Events.ClientReady, onClientReady)
client.on(Events.GuildCreate, onGuildCreate)
client.on(Events.MessageCreate, onMessageCreate)
client.on(Events.InteractionCreate, onInteractionCreate)
