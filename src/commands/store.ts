import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import pMap from 'p-map'

import { type CrowdinCode, LANGUAGE_OBJECTS } from '../constants/i18n'
import { InAppPurchase as GooglePlayInAppPurchase } from '../managers/GooglePlayManager'
import { InAppPurchase as AppleStoreInAppPurchase } from '../managers/AppleStoreManager'

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
  const { Store, Crowdin, Discord } = client.managers
  const iapId = options.getString('iap')
  const crowdinCode = options.getString('language', true) as CrowdinCode
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const languageObject = Crowdin.getLanguages({ withEnglish: false }).find(
    languageObject => languageObject.crowdinCode === crowdinCode
  )!

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  await interaction.editReply({ content: 'Fetching store translations…' })
  const translations = await Store.getStoreTranslations(crowdinCode)
  const [appleStoreIaps, googlePlayIaps] = await Store.fetchAllIaps()

  if (iapId) {
    const iapTranslations = translations.find(({ key }) => key === iapId)
    if (!iapTranslations) {
      return interaction.editReply({
        content: `Could not find an in-app purchase for \`${iapId}\`.`,
      })
    }
    const iapTranslation = iapTranslations.translations[languageObject.locale]

    const googlePlayIap = googlePlayIaps.find(iap => iap.sku === iapId)
    if (!googlePlayIap) {
      return interaction.editReply({
        content: `Could not find a Google Play in-app purchase for \`${iapId}\`.`,
      })
    }

    const appleStoreIap = appleStoreIaps.find(
      iap => iap.attributes.productId === iapId
    )
    if (!appleStoreIap) {
      return interaction.editReply({
        content: `Could not find an Apple in-app purchase for \`${iapId}\`.`,
      })
    }

    await interaction.editReply({
      content: `Updating localization for \`${iapId}\` in \`${crowdinCode}\` on Google Play…`,
    })
    await Store.googlePlay.updateIapLocalization(googlePlayIap, {
      [languageObject.locale]: iapTranslation,
    })

    await interaction.editReply({
      content: `Updating localization for \`${iapId}\` in \`${crowdinCode}\` on Apple Store…`,
    })
    await Store.appleStore.updateIapLocalization(
      languageObject,
      appleStoreIap,
      iapTranslation
    )
  } else {
    await interaction.editReply({
      content: `Updating localization in \`${crowdinCode}\` on Google Play…`,
    })

    const googlePlayEditLimiter = Discord.getDiscordEditLimiter()
    const notifyGooglePlay = googlePlayEditLimiter.wrap(
      (iap: GooglePlayInAppPurchase, index: number) =>
        interaction.editReply({
          content: [
            'Updating localization in progress…',
            '- Platform: Google Play',
            `- Language: \`${crowdinCode}\``,
            `- Progress: ${Math.round(((index + 1) / googlePlayIaps.length) * 100)}%`,
            `- Current: \`${iap.sku}\``,
          ].join('\n'),
        })
    )

    await pMap(
      googlePlayIaps.entries(),
      async ([index, iap]) => {
        const iapTranslations = translations.find(({ key }) => key === iap.sku)
        if (iapTranslations) {
          const iapTranslation =
            iapTranslations.translations[languageObject.locale]

          await notifyGooglePlay(iap, index)
          await Store.googlePlay.updateIapLocalization(iap, {
            [languageObject.locale]: iapTranslation,
          })
        }
      },
      { concurrency: 5 }
    )

    await interaction.editReply({
      content: `Updating localization in \`${crowdinCode}\` on Apple Store…`,
    })

    const appleStoreEditLimiter = Discord.getDiscordEditLimiter()
    const notifyAppleStore = appleStoreEditLimiter.wrap(
      (iap: AppleStoreInAppPurchase, index: number) =>
        interaction.editReply({
          content: [
            'Updating localization in progress…',
            '- Platform: Apple Store',
            `- Language: \`${crowdinCode}\``,
            `- Progress: ${Math.round(((index + 1) / appleStoreIaps.length) * 100)}%`,
            `- Current: \`${iap.attributes.productId}\``,
          ].join('\n'),
        })
    )

    await pMap(
      appleStoreIaps.entries(),
      async ([index, iap]) => {
        const iapTranslations = translations.find(
          ({ key }) => key === iap.attributes.productId
        )
        if (iapTranslations) {
          const iapTranslation =
            iapTranslations.translations[languageObject.locale]

          await notifyAppleStore(iap, index)
          await Store.appleStore.updateIapLocalization(
            languageObject,
            iap,
            iapTranslation
          )
        }
      },
      { concurrency: 5 }
    )
  }

  await interaction.editReply({
    content: iapId
      ? `Successfully uploaded translations for \`${iapId}\`.`
      : 'Successfully uploaded all in-app purchases translations.',
  })
}
