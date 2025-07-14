import { type ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js'
import { logger } from '../utils/logger'

export const scope = 'PUBLIC'

export const data = new SlashCommandBuilder()
  .setName('talk')
  .addStringOption(option =>
    option.setName('message').setDescription('Thing to say').setRequired(true)
  )
  .setDescription('Say something via the bot')

export async function execute(interaction: ChatInputCommandInteraction) {
  logger.logCommand(interaction, 'Starting command execution')

  const { options, channel } = interaction
  const message = options.getString('message', true)

  if (!channel) throw new Error('Could not retrieve channel.')
  if (!channel.isSendable()) throw new Error('Could not send in channel.')

  // Send the message in the channel
  await channel.send(message)

  // Acknowledge the message was sent, and immediately delete acknowledgement (since it’s required
  // by Discord but unnecessary for the user)
  await interaction.reply({ content: 'Sent.', flags: MessageFlags.Ephemeral })
  await interaction.deleteReply()
}
