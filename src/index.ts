import { Events } from 'discord.js'
import { loadModule } from 'cld3-asm'
import 'dotenv/config'

import { client } from './client'
import { DISCORD_TOKEN } from './constants/config'
import { onClientReady } from './events/clientReady'
import { onGuildCreate } from './events/guildCreate'
import { onMessageCreate } from './events/messageCreate'
import { onInteractionCreate } from './events/interactionCreate'
import { MIN_LENGTH_LANGUAGE_DETECTION_THRESHOLD } from './constants/i18n'

async function main() {
  // Store a language identifier on the client on mount so it can be reused
  // for the language detection without incurring a bootstrap performance hit.
  client.languageIdentifier = (await loadModule()).create(
    MIN_LENGTH_LANGUAGE_DETECTION_THRESHOLD
  )

  await client.login(DISCORD_TOKEN)
  client.once(Events.ClientReady, onClientReady)
  client.on(Events.GuildCreate, onGuildCreate)
  client.on(Events.MessageCreate, onMessageCreate)
  client.on(Events.InteractionCreate, onInteractionCreate)
}

main()
