import { type ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js'
import pMap from 'p-map'
import { type CrowdinCode, LANGUAGE_OBJECTS } from '../constants/i18n'
import { DiscordManager } from '../managers/DiscordManager'

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
    option
      .setName('platform')
      .setDescription('Platform')
      .addChoices(
        { name: 'Both', value: 'BOTH' },
        { name: 'Apple Store', value: 'APPLE_STORE' },
        { name: 'Google Play', value: 'GOOGLE_PLAY' }
      )
  )
  .addStringOption(option => option.setName('iap').setDescription('In-app purchase identifier'))
  .setDescription('Localize the store in-app purchases')

export async function execute(interaction: ChatInputCommandInteraction) {
  const { client, options } = interaction
  const { Store, Crowdin, Discord } = client.managers

  const iapId = options.getString('iap')
  const platform = options.getString('platform') ?? 'BOTH'
  const crowdinCode = options.getString('language', true) as CrowdinCode

  const languageObject = Crowdin.getLanguages({ withEnglish: false }).find(
    languageObject => languageObject.crowdinCode === crowdinCode
  )

  if (!languageObject) {
    throw new Error(`Could not retrieve language object for \`${crowdinCode}\`.`)
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  await interaction.editReply({ content: 'Fetching store translations…' })
  const translations = await Store.getStoreTranslations(crowdinCode)

  if (iapId) {
    const iapTranslations = translations.get(iapId)
    if (!iapTranslations) {
      return interaction.editReply({
        content: `Could not find an in-app purchase for \`${iapId}\`.`,
      })
    }

    if (platform === 'BOTH' || platform === 'GOOGLE_PLAY') {
      const googlePlayIaps = await Store.googlePlay.getAllIaps()
      const googlePlayIap = googlePlayIaps.find(iap => iap.sku === iapId)
      if (!googlePlayIap) {
        return interaction.editReply({
          content: `Could not find a Google Play in-app purchase for \`${iapId}\`.`,
        })
      }

      await interaction.editReply({
        content: `Updating localization for \`${iapId}\` in \`${crowdinCode}\` on Google Play…`,
      })
      await Store.googlePlay.updateIapLocalization(googlePlayIap, {
        [languageObject.locale]: iapTranslations[languageObject.locale],
      })
    }

    if (platform === 'BOTH' || platform === 'APPLE_STORE') {
      const appleStoreIaps = await Store.appleStore.getAllIaps()
      const appleStoreIap = appleStoreIaps.find(iap => iap.attributes.productId === iapId)
      if (!appleStoreIap) {
        return interaction.editReply({
          content: `Could not find an Apple in-app purchase for \`${iapId}\`.`,
        })
      }
      await interaction.editReply({
        content: `Updating localization for \`${iapId}\` in \`${crowdinCode}\` on Apple Store…`,
      })
      await Store.appleStore.updateIapLocalization(
        languageObject,
        appleStoreIap,
        iapTranslations[languageObject.locale]
      )
    }
  } else {
    if (platform === 'BOTH' || platform === 'GOOGLE_PLAY') {
      await interaction.editReply({
        content: `Updating localization in \`${crowdinCode}\` on Google Play…`,
      })

      const googlePlayIaps = await Store.googlePlay.getAllIaps()
      const googlePlayEditLimiter = DiscordManager.getDiscordEditLimiter()
      const notifyGooglePlay = googlePlayEditLimiter.wrap(
        (iap: (typeof googlePlayIaps)[number], index: number) =>
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
          const iapTranslations = iap.sku && translations.get(iap.sku)
          if (iapTranslations) {
            await notifyGooglePlay(iap, index)
            try {
              await Store.googlePlay.updateIapLocalization(iap, {
                [languageObject.locale]: iapTranslations[languageObject.locale],
              })
            } catch (error) {
              await Discord.sendInteractionAlert(
                interaction,
                `Failed to upload ${iap.sku} localization to Google Play:
                \`\`\`${error}\`\`\``
              )
            }
          }
        },
        { concurrency: 5 }
      )
    }

    if (platform === 'BOTH' || platform === 'APPLE_STORE') {
      await interaction.editReply({
        content: `Updating localization in \`${crowdinCode}\` on Apple Store…`,
      })

      const appleStoreIaps = await Store.appleStore.getAllIaps()
      const appleStoreEditLimiter = DiscordManager.getDiscordEditLimiter()
      const notifyAppleStore = appleStoreEditLimiter.wrap(
        (iap: (typeof appleStoreIaps)[number], index: number) =>
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
          const iapTranslations = translations.get(iap.attributes.productId)
          if (iapTranslations) {
            await notifyAppleStore(iap, index)
            try {
              await Store.appleStore.updateIapLocalization(
                languageObject,
                iap,
                iapTranslations[languageObject.locale]
              )
            } catch (error) {
              await Discord.sendInteractionAlert(
                interaction,
                `Failed to upload ${iap.attributes.productId} localization to Apple Store:
                \`\`\`${error}\`\`\``
              )
            }
          }
        },
        { concurrency: 5 }
      )
    }
  }

  await interaction.editReply({
    content: iapId
      ? `Successfully updated translations in \`${crowdinCode}\` for \`${iapId}\`.`
      : `Successfully updated translations in \`${crowdinCode}\`.`,
  })
}
