import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js'

import { commands } from './commands'
import { initCrowdinManager } from './managers/CrowdinManager'
import { initFAQManager } from './managers/FAQManager'
import { initFlagsManager } from './managers/FlagsManager'
import { initGiveawayManager } from './managers/GiveawayManager'
import { initIndexManager } from './managers/IndexManager'
import { initLeaderboardManager } from './managers/LeaderboardManager'
import { initLocalizationManager } from './managers/LocalizationManager'
import { initPromptManager } from './managers/PromptManager'
import { initSearchManager } from './managers/SearchManager'

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
client.flagsManager = initFlagsManager(client)
client.indexManager = initIndexManager(client)
client.promptManager = initPromptManager(client)
client.localizationManager = initLocalizationManager(client)
client.crowdinManager = initCrowdinManager(client)
