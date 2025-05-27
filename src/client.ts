import { Client, Collection, GatewayIntentBits } from 'discord.js'
import { commands } from './commands'
import { initGiveawayManager } from './giveaway-manager'

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
})

client.commands = new Collection()

for (const command of Object.values(commands)) {
  client.commands.set(command.data.name, command)
}

client.giveawaysManager = initGiveawayManager(client)
