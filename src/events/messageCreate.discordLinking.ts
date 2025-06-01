import {
  bold,
  channelMention,
  type GuildMember,
  type Message,
  type OmitPartialGroupDMChannel,
} from 'discord.js'
import { shouldIgnoreInteraction } from '../utils/shouldIgnoreInteraction'
import { type Locale, LOCALES } from '../constants/i18n'

// biome-ignore lint/style/noNonNullAssertion: <explanation>
const ENGLISH_LOCALE = LOCALES.find(locale => locale.languageCode === 'en')!
const I18N_ROLES = LOCALES.map(locale => locale.role)

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

export async function discordLinking(
  interaction: OmitPartialGroupDMChannel<Message<boolean>>
) {
  const { content, guild, member } = interaction

  if (!guild || !member || member.user.bot) return
  if (shouldIgnoreInteraction(interaction)) return
  if (!looksLikePlayerId(content)) return

  const channelName = '🔗│discord-linking'
  const infoChannel = guild.channels.cache.find(
    ({ name }) => name === channelName
  )
  const link = infoChannel ? channelMention(infoChannel.id) : channelName
  const locale = getMemberLocale(member)
  const response = locale.messages.discord_linking
  const responseEnglish = ENGLISH_LOCALE.messages.discord_linking

  const message =
    locale.languageCode === 'en'
      ? response
      : [
          `${bold(locale.languageName)}: ${response.replace('%s', link)}`,
          `${bold(ENGLISH_LOCALE.languageName)}: ${responseEnglish.replace('%s', link)}`,
        ].join('\n\n')

  return interaction.reply(message)
}
