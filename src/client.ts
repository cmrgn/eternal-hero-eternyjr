import { Client, Collection, GatewayIntentBits } from 'discord.js'
import { commands } from './commands'
import { initGiveawayManager } from './utils/giveaway-manager'
import { initFAQManager } from './utils/faq-manager'

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