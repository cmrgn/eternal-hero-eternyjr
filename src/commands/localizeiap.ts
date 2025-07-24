import { type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js'
import pMap from 'p-map'
import { type CrowdinCode, LANGUAGE_OBJECTS } from '../constants/i18n'
import { DiscordManager } from '../managers/DiscordManager'
import type { InAppPurchase } from '../managers/GooglePlayManager'

export const scope = 'OFFICIAL'

export const data = new SlashCommandBuilder()
  .setName('localizeiap')
  .addSubcommand(subcommand =>
    subcommand
      .setName('content')
      .setDescription('Localize in-app purchases content')
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
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('price')
      .setDescription('Localize in-app purchases prices')
      .addStringOption(option =>
        option.setName('platform').setDescription('Platform').addChoices(
          // { name: 'Both', value: 'BOTH' },
          { name: 'Apple Store', value: 'APPLE_STORE' },
          { name: 'Google Play', value: 'GOOGLE_PLAY' }
        )
      )
      .addStringOption(option => option.setName('iap').setDescription('In-app purchase identifier'))
  )

  .setDescription('Localize the store in-app purchases')

type StorePlatform = 'GOOGLE_PLAY' | 'APPLE_STORE'
type StorePlatformOptions = StorePlatform | 'BOTH'

export async function execute(interaction: ChatInputCommandInteraction) {
  const { CommandLogger } = interaction.client.managers
  const subcommand = interaction.options.getSubcommand()

  CommandLogger.logCommand(interaction, 'Starting command execution')

  await interaction.deferReply()

  if (subcommand === 'content') await commandContent(interaction)
  if (subcommand === 'price') await commandPrice(interaction)
}

async function commandContent(interaction: ChatInputCommandInteraction) {
  const { options, client } = interaction
  const { Crowdin, Discord, Store } = client.managers
  const iapId = options.getString('iap')
  const platform = (options.getString('platform') ?? 'BOTH') as StorePlatformOptions
  const crowdinCode = options.getString('language', true) as CrowdinCode

  const languageObject = Crowdin.getLanguages({ withEnglish: false }).find(
    languageObject => languageObject.crowdinCode === crowdinCode
  )

  if (!languageObject) {
    throw new Error(`Could not retrieve language object for \`${crowdinCode}\`.`)
  }

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
        content: `Localizing content for \`${iapId}\` in \`${crowdinCode}\` on Google Play…`,
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
        content: `Localizing content for \`${iapId}\` in \`${crowdinCode}\` on Apple Store…`,
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
        content: `Localizing content in \`${crowdinCode}\` on Google Play…`,
      })

      const googlePlayIaps = await Store.googlePlay.getAllIaps()
      const notifyGooglePlay = getDiscordNotifier(
        interaction,
        'Localizing content in progress…',
        'GOOGLE_PLAY',
        googlePlayIaps,
        iap => iap.sku,
        crowdinCode
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
        content: `Localizing content in \`${crowdinCode}\` on Apple Store…`,
      })

      const appleStoreIaps = await Store.appleStore.getAllIaps()
      const notifyAppleStore = getDiscordNotifier(
        interaction,
        'Localizing content in progress…',
        'APPLE_STORE',
        appleStoreIaps,
        iap => iap.attributes.productId,
        crowdinCode
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

  return interaction.editReply({
    content: iapId
      ? `Successfully updated translations in \`${crowdinCode}\` for \`${iapId}\`.`
      : `Successfully updated translations in \`${crowdinCode}\`.`,
  })
}

async function commandPrice(interaction: ChatInputCommandInteraction) {
  const { client, options } = interaction
  const { Store, CommandLogger } = client.managers
  const iapId = options.getString('iap')
  const platform = (options.getString('platform') ?? 'BOTH') as StorePlatformOptions

  if (iapId) {
    if (platform === 'BOTH' || platform === 'GOOGLE_PLAY') {
      let iap: InAppPurchase

      await interaction.editReply({
        content: `Localizing prices for \`${iapId}\` on Google Play…`,
      })

      try {
        iap = await Store.googlePlay.getIap(iapId)
      } catch (error) {
        CommandLogger.log('error', 'No valid IAP found.', { error, iapId })
        return interaction.editReply({
          content: `Could not retrieve a valid in-app purchase named \`${iapId}\`.`,
        })
      }

      const response = await Store.googlePlay.localizeIapPrices(iap)

      await interaction.editReply({
        content: response
          ? `Successfully localized prices for in-app purchase \`${iapId}\` on Google Play:\n` +
            formatOutcome(response.currentPrices, response.updatedPrices)
          : `Failed to localize prices for in-app purchase \`${iapId}\` on Google Play.`,
      })
    }

    if (platform === 'BOTH' || platform === 'APPLE_STORE') {
      await interaction.editReply({
        content: `Localizing prices for \`${iapId}\` on Apple Store…`,
      })

      const iaps = await Store.appleStore.getAllIaps()
      const iap = iaps.find(iap => iap.attributes.productId === iapId)

      if (!iap) {
        return interaction.editReply({
          content: `Could not retrieve a valid in-app purchase named \`${iapId}\`.`,
        })
      }

      const response = await Store.appleStore.localizeIapPrices(iap.id)

      return interaction.editReply({
        content: response
          ? `Successfully localized prices for in-app purchase \`${iapId}\` on Apple Store:\n` +
            formatOutcome(response.currentPrices, response.updatedPrices)
          : `Failed to localize prices for in-app purchase \`${iapId}\` on Apple Store.`,
      })
    }
  } else {
    if (platform === 'BOTH' || platform === 'GOOGLE_PLAY') {
      await interaction.editReply({
        content: `Localizing prices on Google Play…`,
      })

      const iaps = await Store.googlePlay.getAllIaps()
      const notify = getDiscordNotifier(
        interaction,
        'Price localization in progress…',
        'GOOGLE_PLAY',
        iaps,
        iap => iap.sku
      )

      await pMap(
        iaps.entries(),
        async ([index, iap]) => {
          await notify(iap, index)
          await Store.googlePlay.localizeIapPrices(iap)
        },
        { concurrency: 5 }
      )
    }

    if (platform === 'BOTH' || platform === 'APPLE_STORE') {
      await interaction.editReply({
        content: `Localizing prices on Apple Store…`,
      })

      const iaps = await Store.appleStore.getAllIaps()
      const notify = getDiscordNotifier(
        interaction,
        'Price localization in progress…',
        'APPLE_STORE',
        iaps,
        iap => iap.attributes.productId
      )

      await pMap(
        iaps.entries(),
        async ([index, iap]) => {
          await notify(iap, index)
          await Store.appleStore.localizeIapPrices(iap.id)
        },
        { concurrency: 5 }
      )
    }
  }
}

function formatOutcome(
  currentPrices: Record<string, { currency: string; priceMicros: string }>,
  updatedPrices: Record<string, { currency: string; priceMicros: string }>
) {
  return Object.entries(updatedPrices)
    .map(([region, { currency, priceMicros }]) => {
      const cf = new Intl.NumberFormat('en-US', {
        currency: currency,
        currencyDisplay: 'narrowSymbol',
        style: 'currency',
      })
      const prevPrice = currentPrices[region]?.priceMicros ?? '0'
      const f = (priceMicros: string) => cf.format(+priceMicros / 1_000_000)
      return `- ${region}: ~~${f(prevPrice)}~~ **${f(priceMicros)}**`
    })
    .join('\n')
}

function getDiscordNotifier<T>(
  interaction: ChatInputCommandInteraction,
  label: string,
  platform: StorePlatform,
  entries: T[],
  getMainKey: (t: T) => string | null | undefined,
  language?: CrowdinCode
) {
  const discordEditLimiter = DiscordManager.getDiscordEditLimiter()
  const platformNames = {
    APPLE_STORE: 'Apple Store',
    GOOGLE_PLAY: 'Google Play',
  }
  const notify = discordEditLimiter.wrap((entry: T, index: number) =>
    interaction.editReply({
      content: [
        label,
        `- Platform: ${platformNames[platform] ?? 'unknown'}`,
        language ? `- Language: \`${language}\`` : '',
        `- Progress: ${Math.round(((index + 1) / entries.length) * 100)}%`,
        `- Current: _“${getMainKey(entry) ?? 'unknown'}”_`,
      ]
        .filter(Boolean)
        .join('\n'),
    })
  )

  return notify
}
