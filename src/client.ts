import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js'

import { commands } from './commands'
import { initGiveawayManager } from './utils/GiveawayManager'
import { initFAQManager } from './utils/FAQManager'
import { initLeaderboardManager } from './utils/LeaderboardManager'
import { initSearchManager } from './utils/SearchManager'
import { initLocalizationManager } from './utils/LocalizationManager'
import { initIndexationManager } from './utils/IndexationManager'

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel],
})

client.commands = new Collection()

for (const command of Object.values(commands)) {
  client.commands.set(command.data.name, command)
}

client.giveawaysManager = initGiveawayManager(client)
client.faqManager = initFAQManager(client)
client.leaderboardManager = initLeaderboardManager(client)
client.searchManager = initSearchManager(client)
client.indexationManager = initIndexationManager(client)
client.localizationManager = initLocalizationManager(client)
