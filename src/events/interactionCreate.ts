import { type Interaction, MessageFlags } from 'discord.js'
import { logger } from '../utils/logger'
import { handleAutocomplete } from './interactionCreate.autocomplete'
import { handleButtons } from './interactionCreate.buttons'

export async function onInteractionCreate(interaction: Interaction) {
  const { user, client } = interaction
  const { Discord } = client.managers

  // Abort if this interaction is coming from a bot, as this shouldn’t happen.
  if (user.bot) return

  // Check whether the interaction should be processed before proceeding.
  if (Discord.shouldIgnoreInteraction(interaction)) return

  if (interaction.isButton()) return handleButtons(interaction)
  if (interaction.isAutocomplete()) return handleAutocomplete(interaction)
  if (!interaction.isChatInputCommand()) return

  try {
    const command = client.commands.get(interaction.commandName)
    if (command) await command.execute(interaction)
  } catch (error) {
    const message = 'There was an error while executing this command.'

    logger.logCommand(interaction, 'There was an error while executing this command.', { error })
    await Discord.sendInteractionAlert(interaction, `${message}\n\`\`\`${error}\`\`\``)

    if (interaction.replied || interaction.deferred)
      await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral })
    else await interaction.reply({ content: message, flags: MessageFlags.Ephemeral })
  }
}
