import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'

import { type CrowdinCode, LANGUAGE_OBJECTS } from '../constants/i18n'

export const scope = 'OFFICIAL'

export const data = new SlashCommandBuilder()
  .setName('store')
  .addStringOption(option =>
    option
      .setName('language')
      .setDescription('Translation language')
      .setChoices(
        Object.values(LANGUAGE_OBJECTS)
          .filter(languageObject => languageObject.isOnCrowdin)
          .map(languageObject => ({
            name: languageObject.languageName,
            value: languageObject.crowdinCode,
          }))
      )
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('iap').setDescription('In-app purchase identifier')
  )
  .setDescription('Localize the store in-app purchases')

export async function execute(interaction: ChatInputCommandInteraction) {
  const { client, options } = interaction
  const { Store } = client.managers
  const iap = options.getString('iap', true)
  const crowdinCode = options.getString('language', true) as CrowdinCode

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  if (iap) await Store.updateIapLocalization(crowdinCode, iap)
  else await Store.updateIapLocalizations(crowdinCode)

  await interaction.editReply({
    content: iap
      ? `Successfully uploaded translations for \`${iap}\`.`
      : 'Successfully uploaded all in-app purchases translations.',
  })
}
