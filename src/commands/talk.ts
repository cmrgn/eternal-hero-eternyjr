import { type CommandInteraction, SlashCommandBuilder } from 'discord.js'

export const data = new SlashCommandBuilder()
  .setName('talk')
  .addStringOption(option =>
    option.setName('message').setDescription('Thing to say').setRequired(true)
  )
  .setDescription('Say something via the bot')

export async function execute(interaction: CommandInteraction) {
  if (!interaction.channel) {
    throw new Error('Could not retrieve channel.')
  }

  if (interaction.channel.isSendable()) {
    // @ts-ignore
    const message = interaction.options.getString('message')
    return interaction.channel.send(message)
  }
}
