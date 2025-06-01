import {
  bold,
  channelMention,
  PermissionFlagsBits,
  type GuildMember,
  type Message,
  type OmitPartialGroupDMChannel,
} from 'discord.js'
import { shouldIgnoreInteraction } from '../utils/shouldIgnoreInteraction'
import { type Locale, LOCALES } from '../constants/i18n'
import { IS_DEV } from '../config'

type DiscordMessage = OmitPartialGroupDMChannel<Message<boolean>>

// biome-ignore lint/style/noNonNullAssertion: <explanation>
const ENGLISH_LOCALE = LOCALES.find(locale => locale.languageCode === 'en')!
const I18N_ROLES = LOCALES.map(locale => locale.role)
const BOT_TEST_CHANNEL_ID = '1373605591766925412'
const INCLUDED_CATEGORY_IDS = [
  /* General */ '1239259552357158942',
  /* Bug report */ '1239437158247567360',
  /* Feedback */ '1271841974994993224',
  /* Weapons */ '1262801739829219511',
  /* General (test) */ IS_DEV && '714858253531742209',
  /* FAQ (test) */ IS_DEV && '1373344771552317532',
].filter(Boolean)

const looksLikePlayerId = (message: string) => {
  if (message.length < 20) return false
  if (message.toLocaleLowerCase() === message) return false
  if (message.toLocaleUpperCase() === message) return false

  return /^[A-Za-z0-9]+$/.test(message)
}

function getMemberLocale(member: GuildMember | null): Locale {
  if (!member) throw new Error('Missing member to get locale from.')

  const roles = member?.roles.cache
  const i18nRole = roles.find(role => I18N_ROLES.includes(role.name))
  if (!i18nRole) return ENGLISH_LOCALE

  const locale = LOCALES.find(locale => locale.role === i18nRole.name)
  return locale ?? ENGLISH_LOCALE
}

function getChannel(interaction: DiscordMessage) {
  const { guild, channel } = interaction
  return guild?.channels.cache.find(({ id }) => id === channel.id)
}

function helpWithDiscordLinking(interaction: DiscordMessage) {
  const { guild, member } = interaction
  if (!guild || !member) return

  const channelName = '🔗│discord-linking'
  const infoChannel = guild.channels.cache.find(
    ({ name }) => name === channelName
  )
  const link = infoChannel ? channelMention(infoChannel.id) : channelName
  const locale = getMemberLocale(member)
  const response = locale.messages.discord_linking
  const responseEnglish = ENGLISH_LOCALE.messages.discord_linking

  return locale.languageCode === 'en'
    ? response
    : [
        `${bold(locale.languageName)}: ${response.replace('%s', link)}`,
        `${bold(ENGLISH_LOCALE.languageName)}: ${responseEnglish.replace('%s', link)}`,
      ].join('\n\n')
}

export async function onMessageCreate(interaction: DiscordMessage) {
  const { content, guild, member, client } = interaction

  if (!guild || !member) return
  if (member.user.bot) return
  if (shouldIgnoreInteraction(interaction)) return

  if (looksLikePlayerId(content)) {
    const message = helpWithDiscordLinking(interaction)
    return message ? interaction.reply(message) : undefined
  }

  const channel = getChannel(interaction)
  if (!channel) return

  // If the bot doesn’t have the permissions to post in the current channel,
  // return early as there is no point trying and throwing an error.
  const self = guild.members.me
  const permission = PermissionFlagsBits.SendMessages
  if (!self || !channel.permissionsFor(self).has(permission)) return

  // If the current channel does not belong to a listed category (by being top-
  // level or by belonging to a category that’s not listed), return early. An
  // exception is made to the bot testing channel.
  if (!channel.parentId) return
  const isTestChannel = channel.id === BOT_TEST_CHANNEL_ID
  const isInRelevantCategory = INCLUDED_CATEGORY_IDS.includes(channel.parentId)
  if (!isTestChannel && !isInRelevantCategory) return

  // If the current channel is a thread, return early as it may be a clan
  // recruitment thread, or just something else where non-English is allowed.
  // if (channel.isThread()) return

  // If the guessed language is English, return early as there is nothing to do.
  const guess = client.languageIdentifier.findLanguage(content)
  if (guess.language === 'en') return

  // If the guessed language is not unknown or unreliable, return early as it’s
  // better to have a false negative than a false positive.
  if (guess.language === 'und' || !guess.is_reliable || guess.probability < 0.9)
    return

  // If the guessed language is not a language we have an international channel
  // for, return the generic English response about rule 3.1.
  const locale = LOCALES.find(locale => locale.languageCode === guess.language)
  const inEnglish = ENGLISH_LOCALE.messages.internationalization
  if (!locale) return interaction.reply(inEnglish)

  const i18nChannel = guild.channels.cache.find(
    ({ name }) => name === locale.channel
  )
  const link = i18nChannel ? channelMention(i18nChannel.id) : locale.channel
  const inLanguage = locale.messages.internationalization
  const message = [
    `${bold(locale.languageName)}: ${inLanguage.replace('%s', link)}`,
    `${bold(ENGLISH_LOCALE.languageName)}: ${inEnglish}`,
  ].join('\n\n')

  return interaction.reply(message)
}
