import { MessageFlags, type Interaction } from 'discord.js'
import { shouldIgnoreInteraction } from '../utils/shouldIgnoreInteraction'

export async function onInteractionCreate(interaction: Interaction) {
  // Abort if this interaction is coming from a bot, as this shouldn’t happen.
  if (interaction.user.bot) return

  // Check whether the interaction should be processed before proceeding.
  if (shouldIgnoreInteraction(interaction)) return

  if (!interaction.isChatInputCommand()) return

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
}
