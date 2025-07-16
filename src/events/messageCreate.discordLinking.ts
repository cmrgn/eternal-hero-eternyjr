import { bold, channelMention, type GuildMember } from 'discord.js'
import { ENGLISH_LANGUAGE_OBJECT, LANGUAGE_OBJECTS } from '../constants/i18n'
import type { TextMessageInChannel } from './messageCreate'

const LANGUAGE_ROLES = LANGUAGE_OBJECTS.map(languageObject => languageObject.role)

const looksLikePlayerId = (message: string) => {
  if (message.length < 20) return false
  if (message.toLocaleLowerCase() === message) return false
  if (message.toLocaleUpperCase() === message) return false

  return /^[A-Za-z0-9]+$/.test(message)
}

function getMemberLanguageObject(member: GuildMember | null) {
  if (!member) throw new Error('Missing member to get language object from.')

  // If the member has no international role, or multiple of them, return the English language
  // object.
  const roles = member?.roles.cache
  const i18nRoles = roles.filter(role => LANGUAGE_ROLES.includes(role.name))
  if (i18nRoles.size !== 1) return ENGLISH_LANGUAGE_OBJECT

  const [i18nRole] = Array.from(i18nRoles.values())
  const languageObject = LANGUAGE_OBJECTS.find(({ role }) => role === i18nRole.name)
  return languageObject ?? ENGLISH_LANGUAGE_OBJECT
}

export async function discordLinking(interaction: TextMessageInChannel) {
  const { content, client, member, guild } = interaction
  const { Discord } = client.managers

  if (!looksLikePlayerId(content)) return

  const channelName = '🔗│discord-linking'
  const infoChannel = Discord.getChannelByName(guild, channelName)
  const link = infoChannel ? channelMention(infoChannel.id) : channelName
  const languageObject = getMemberLanguageObject(member)
  const response = languageObject.messages.discord_linking
  const responseEnglish = ENGLISH_LANGUAGE_OBJECT.messages.discord_linking

  const message =
    languageObject.twoLettersCode === 'en'
      ? response.replace('%s', link)
      : [
          `${bold(languageObject.languageName)}: ${response.replace('%s', link)}`,
          `${bold(ENGLISH_LANGUAGE_OBJECT.languageName)}: ${responseEnglish.replace('%s', link)}`,
        ].join('\n\n')

  return interaction.reply(message)
}
