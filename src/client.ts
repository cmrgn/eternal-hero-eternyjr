import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js'

import { commands } from './commands'
import { initGiveawayManager } from './managers/GiveawayManager'
import { initFAQManager } from './managers/FAQManager'
import { initLeaderboardManager } from './managers/LeaderboardManager'
import { initSearchManager } from './managers/SearchManager'
import { initLocalizationManager } from './managers/LocalizationManager'
import { initIndexationManager } from './managers/IndexationManager'
import { initCrowdinManager } from './managers/CrowdinManager'

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
client.crowdinManager = initCrowdinManager(client)
