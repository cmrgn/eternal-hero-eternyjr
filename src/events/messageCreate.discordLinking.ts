import { bold, channelMention, type GuildMember } from 'discord.js'

import { type Locale, LOCALES, ENGLISH_LOCALE } from '../constants/i18n'
import type { EnsuredInteraction } from './messageCreate'

const I18N_ROLES = LOCALES.map(locale => locale.role)

const looksLikePlayerId = (message: string) => {
  if (message.length < 20) return false
  if (message.toLocaleLowerCase() === message) return false
  if (message.toLocaleUpperCase() === message) return false

  return /^[A-Za-z0-9]+$/.test(message)
}

function getMemberLocale(member: GuildMember | null): Locale {
  if (!member) throw new Error('Missing member to get locale from.')

  // If the member has no international role, or multiple of them, return
  // English as a locale.
  const roles = member?.roles.cache
  const i18nRoles = roles.filter(role => I18N_ROLES.includes(role.name))
  if (i18nRoles.size !== 1) return ENGLISH_LOCALE

  const [i18nRole] = Array.from(i18nRoles.values())
  const locale = LOCALES.find(locale => locale.role === i18nRole.name)
  return locale ?? ENGLISH_LOCALE
}

export async function discordLinking(interaction: EnsuredInteraction) {
  const { content, guild, member } = interaction

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
      ? response.replace('%s', link)
      : [
          `${bold(locale.languageName)}: ${response.replace('%s', link)}`,
          `${bold(ENGLISH_LOCALE.languageName)}: ${responseEnglish.replace('%s', link)}`,
        ].join('\n\n')

  return interaction.reply(message)
}
