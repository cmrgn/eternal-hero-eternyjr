import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'

export const scope = 'OFFICIAL'

export const data = new SlashCommandBuilder()
  .setName('store')
  .addStringOption(option =>
    option.setName('iap').setDescription('In-app purchase identifier')
  )
  .setDescription('Localize the store in-app purchases')

export async function execute(interaction: ChatInputCommandInteraction) {
  const { client, options } = interaction
  const { Store } = client.managers
  const iap = options.getString('iap', true)

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  if (iap) await Store.updateIapLocalization(iap)
  else await Store.updateIapLocalizations()

  await interaction.editReply({
    content: iap
      ? `Successfully uploaded translations for \`${iap}\`.`
      : 'Successfully uploaded all in-app purchases translations.',
  })
}
