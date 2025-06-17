import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { logger } from '../utils/logger'

export const scope = 'PUBLIC'

export const data = new SlashCommandBuilder()
  .setName('talk')
  .addStringOption(option =>
    option.setName('message').setDescription('Thing to say').setRequired(true)
  )
  .setDescription('Say something via the bot')

export async function execute(interaction: ChatInputCommandInteraction) {
  const { channel, options } = interaction
  const { Ephemeral } = MessageFlags
  const message = options.getString('message', true)

  if (!channel) throw new Error('Could not retrieve channel.')
  if (!channel.isSendable()) throw new Error('Could not send in channel.')

  logger.command(interaction)

  await channel.send(message)
  await interaction.reply({ content: 'Sent.', flags: Ephemeral })
  await interaction.deleteReply()
}
