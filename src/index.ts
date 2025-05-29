import { Events, MessageFlags } from 'discord.js'
import { deployCommands } from './deploy-commands'
import { DISCORD_TOKEN, IS_DEV, IS_PROD, TEST_SERVER_ID } from './config'
import { client } from './client'
import { discordLinking } from './discord-linking'
import { shouldIgnoreInteraction } from './utils'

client.login(DISCORD_TOKEN)

client.once(Events.ClientReady, readyClient => {
  console.log(`Discord bot is ready! 🤖 Logged in as ${readyClient.user.tag}`)

  // This makes it convenient to work on the bot locally, by automatically
  // redeploying the commands to the test server (given as an environment
  // variable) every time the server gets started (such as when saving a file
  // that gets bundled).
  if (IS_DEV && TEST_SERVER_ID) deployCommands({ guildId: TEST_SERVER_ID })
})

// Deploy the commands for the guild when adding the bot to said Discord server.
client.on(Events.GuildCreate, guild => deployCommands({ guildId: guild.id }))

// Automatically intercept what looks like player IDs, and link to the instru-
// ctions to link one’s account to Discord.
client.on(Events.MessageCreate, discordLinking)

client.on(Events.InteractionCreate, async interaction => {
  // Abort if this interaction is coming from a bot, as this shouldn’t happen.
  if (interaction.user.bot) return

  // Check whether the interaction should be processed before proceeding.
  if (shouldIgnoreInteraction(interaction)) return

  if (interaction.isChatInputCommand()) {
    try {
      const command = interaction.client.commands.get(interaction.commandName)
      if (command) await command.execute(interaction)
    } catch (error) {
      const message = 'There was an error while executing this command.'
      const { Ephemeral } = MessageFlags
      console.error(error)
      if (interaction.replied || interaction.deferred)
        await interaction.followUp({ content: message, flags: Ephemeral })
      else await interaction.reply({ content: message, flags: Ephemeral })
    }
  } else if (interaction.isAutocomplete()) {
    try {
      const command = interaction.client.commands.get(interaction.commandName)
      if (command?.autocomplete) await command.autocomplete(interaction)
    } catch (error) {
      console.error(error)
    }
  }
})
