import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js'

import { commands } from './commands'
import { CrowdinManager } from './managers/CrowdinManager'
import { FAQManager } from './managers/FAQManager'
import { FlagsManager } from './managers/FlagsManager'
import { initGiveawayManager } from './managers/GiveawayManager'
import { IndexManager } from './managers/IndexManager'
import { LeaderboardManager } from './managers/LeaderboardManager'
import { LocalizationManager } from './managers/LocalizationManager'
import { PromptManager } from './managers/PromptManager'
import { SearchManager } from './managers/SearchManager'

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

// @ts-expect-error
client.managers = {}
client.managers.Giveaways = initGiveawayManager(client)
client.managers.Faq = new FAQManager(client).bindEvents()
client.managers.Leaderboard = new LeaderboardManager(client).bindEvents()
client.managers.Search = new SearchManager(client)
client.managers.Flags = new FlagsManager(client)
client.managers.Index = new IndexManager(client).bindEvents()
client.managers.Prompt = new PromptManager(client)
client.managers.Localization = new LocalizationManager(client)
client.managers.Crowdin = new CrowdinManager(client)
