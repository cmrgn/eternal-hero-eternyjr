import {
  type CommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'

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
    try {
      // @ts-ignore
      const message = interaction.options.getString('message')
      await interaction.channel.send(message)

      await interaction.reply({
        content: 'Message successfully sent via the bot.',
        flags: MessageFlags.Ephemeral,
      })
      await interaction.deleteReply()
    } catch (error) {
      return interaction.reply({
        content: 'There was a problem while sending the message via the bot.',
        flags: MessageFlags.Ephemeral,
      })
    }
  }
}
