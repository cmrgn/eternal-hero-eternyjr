import { Client, Collection, GatewayIntentBits } from 'discord.js'
import OpenAI from 'openai'
import { Pinecone } from '@pinecone-database/pinecone'

import { commands } from './commands'
import { initGiveawayManager } from './utils/GiveawayManager'
import { initFAQManager } from './utils/FAQManager'
import { initLeaderboardManager } from './utils/LeaderboardManager'
import { OPENAI_API_KEY, PINECONE_API_KEY } from './constants/config'
import { initSearchManager } from './utils/SearchManager'
import { initLocalizationManager } from './utils/LocalizationManager'

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
})

client.commands = new Collection()

for (const command of Object.values(commands)) {
  client.commands.set(command.data.name, command)
}

client.giveawaysManager = initGiveawayManager(client)
client.faqManager = initFAQManager(client)
client.leaderboardManager = initLeaderboardManager(client)
client.searchManager = initSearchManager(client)
client.localizationManager = initLocalizationManager(client)
