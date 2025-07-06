import { Events } from 'discord.js'
import 'dotenv/config'

import { client } from './client'
import { onClientReady } from './events/clientReady'
import { onGuildCreate } from './events/guildCreate'
import { onMessageCreate } from './events/messageCreate'
import { onInteractionCreate } from './events/interactionCreate'

client.login(client.managers.Discord.token)
client
  .once(Events.ClientReady, onClientReady)
  .on(Events.GuildCreate, onGuildCreate)
  .on(Events.MessageCreate, onMessageCreate)
  .on(Events.InteractionCreate, onInteractionCreate)
