import { type ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js'

export const scope = 'PUBLIC'

export const data = new SlashCommandBuilder()
  .setName('talk')
  .addStringOption(option =>
    option.setName('message').setDescription('Thing to say').setRequired(true)
  )
  .setDescription('Say something via the bot')

export async function execute(interaction: ChatInputCommandInteraction) {
  const { options, client, channel } = interaction
  const { CommandLogger } = client.managers

  CommandLogger.logCommand(interaction, 'Starting command execution')

  const message = options.getString('message', true)

  if (!channel?.isSendable()) throw new Error('Cannot send a message in channel.')

  // Send the message in the channel
  await channel.send(message)

  // Acknowledge the message was sent, and immediately delete acknowledgement (since it’s required
  // by Discord but unnecessary for the user)
  await interaction.reply({ content: 'Sent.', flags: MessageFlags.Ephemeral })
  await interaction.deleteReply()
}
