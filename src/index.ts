import { Events } from 'discord.js'
import { client } from './client'
import { DISCORD_TOKEN, IS_DEV, TEST_SERVER_ID } from './config'
import { deployCommands } from './utils/deploy-commands'
import { discordLinking } from './events/discord-linking'
import { handleCommands } from './events/handle-commands'
import {
  faqLinksOnCreate,
  faqLinksOnDelete,
  faqLinksOnUpdate,
} from './events/faq-leaderboard'
import { FAQManager } from './utils/faq-manager'

client.login(DISCORD_TOKEN)

client.once(Events.ClientReady, async readClient => {
  console.log(`Discord bot is ready! 🤖 Logged in as ${readClient.user.tag}`)

  // This makes it convenient to work on the bot locally, by automatically
  // redeploying the commands to the test server (given as an environment
  // variable) every time the server gets started (such as when saving a file
  // that gets bundled).
  if (IS_DEV && TEST_SERVER_ID) deployCommands(TEST_SERVER_ID)
})

// Deploy the commands for the guild when adding the bot to said Discord server.
client.on(Events.GuildCreate, guild => deployCommands(guild.id))

// Automatically intercept what looks like player IDs, and link to the instru-
// ctions to link one’s account to Discord.
client.on(Events.MessageCreate, discordLinking)

// Look for FAQ links in any message in order to maintain the FAQ leaderboard.
client.on(Events.MessageCreate, faqLinksOnCreate)
client.on(Events.MessageDelete, faqLinksOnDelete)
client.on(Events.MessageUpdate, faqLinksOnUpdate)

// Handle commands that are supported by the bot.
client.on(Events.InteractionCreate, handleCommands)

// Cache the FAQ on the client and listen to changes to keep it up-to-date.
client.faqManager = new FAQManager(client)
client.faqManager.bindEvents()
