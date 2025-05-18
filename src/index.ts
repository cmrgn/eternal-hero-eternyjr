import { Events, MessageFlags } from 'discord.js'
import { deployCommands } from './deploy-commands'
import { DISCORD_TOKEN, IS_DEV, IS_PROD, TEST_SERVER_ID } from './config'
import { client } from './client'

client.login(DISCORD_TOKEN)

client.once(Events.ClientReady, async readyClient => {
  console.log(`Discord bot is ready! 🤖 Logged in as ${readyClient.user.tag}`)

  if (IS_DEV && TEST_SERVER_ID)
    await deployCommands({ guildId: TEST_SERVER_ID })
})

client.on(Events.GuildCreate, async guild => {
  await deployCommands({ guildId: guild.id })
})

client.on(Events.MessageCreate, async interaction => {
  const content = interaction.content

  if (/^[A-Za-z0-9]{20,}/.test(content)) {
    const discordLinking = interaction.guild?.channels.cache.find(
      channel => channel.name === '🔗│discord-linking'
    )

    return interaction.reply(
      `It looks like you’re attempting to link your game account to your Discord account. However, you appear to have pasted your game ID instead of the linking command. Please, carefully follow the instructions in ${discordLinking?.url ?? '#discord-linking'}.`
    )
  }
})

client.on(Events.InteractionCreate, async interaction => {
  // Abort early if this interaction is not the result of a chat command
  if (!interaction.isChatInputCommand()) return

  // Abort if this interaction is coming from a bot, as this shouldn’t happen
  if (interaction.user.bot) return

  // Prevent the production bot from answering in the test server, and the test
  // bot from answering in any other server than the test one
  if (IS_PROD && interaction.guildId === TEST_SERVER_ID) return
  if (IS_DEV && interaction.guildId !== TEST_SERVER_ID) return

  try {
    const command = interaction.client.commands.get(interaction.commandName)
    if (command) await command.execute(interaction)
  } catch (error) {
    console.error(error)
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'There was an error while executing this command.',
        flags: MessageFlags.Ephemeral,
      })
    } else {
      await interaction.reply({
        content: 'There was an error while executing this command.',
        flags: MessageFlags.Ephemeral,
      })
    }
  }
})
