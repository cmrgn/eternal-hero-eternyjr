import { Events } from 'discord.js'
import { client } from './client'
import { DISCORD_TOKEN, IS_DEV, TEST_SERVER_ID } from './config'
import { deployCommands } from './utils/deploy-commands'
import { discordLinking } from './events/discord-linking'
import { handleCommands } from './events/handle-commands'

client.login(DISCORD_TOKEN)

client.once(Events.ClientReady, readyClient => {
  console.log(`Discord bot is ready! 🤖 Logged in as ${readyClient.user.tag}`)

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

// Handle commands that are supported by the bot.
client.on(Events.InteractionCreate, handleCommands)
