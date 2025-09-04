import { bold, channelMention, type PublicThreadChannel, type TextChannel } from 'discord.js'
import { ENGLISH_LANGUAGE_OBJECT, LANGUAGE_OBJECTS } from '../constants/i18n'
import type { TextMessageInChannel } from './messageCreate'

const INCLUDED_CATEGORY_IDS = [
  /* General */ '1239259552357158942',
  /* Bug report */ '1239437158247567360',
  /* Feedback */ '1271841974994993224',
  /* Weapons */ '1262801739829219511',
  /* Community */ '1239263655426523188',
]

const DEV_INCLUDED_CATEGORY_IDS = [
  /* General (test) */ '714858253531742209',
  /* FAQ (test) */ '1373344771552317532',
]

export async function languageDetection(
  interaction: TextMessageInChannel,
  channel: TextChannel | PublicThreadChannel
) {
  const { client, guild } = interaction
  const { Localization, Discord } = client.managers

  // Remove URLs from the message before performing language detection as to not consider URL
  // content.
  const content = interaction.content.replace(/https?:\/\/[\n\S]+/g, '').trim()

  // The single letter “u” commonly used as a replacement for the word “you” in English causes CLD3
  // to mistake English internet slang for Luxembourgish where it exists as a one-letter word.
  const adjustedContent = content.replace(/\bu\b/g, 'you')

  // If the current channel does not belong to a listed category (by being top-level or by belonging
  // to a category that’s not listed), return early. An exception is made to the bot testing channel.
  if (!channel.parentId) return

  const isTestChannel = channel.id === Discord.BOT_TEST_CHANNEL_ID
  const isInRelevantCategory =
    INCLUDED_CATEGORY_IDS.includes(channel.parentId) ||
    (Discord.IS_DEV && DEV_INCLUDED_CATEGORY_IDS.includes(channel.parentId))
  if (!isTestChannel && !isInRelevantCategory) return

  const guessedLanguage = Localization.guessLanguageWithCld3(adjustedContent)

  // If the guessed language is unknown or unreliable, return early as it’s better to have a false
  // negative than a false positive. If the guessed language is English, return early as there is
  // nothing to do.
  if (!guessedLanguage?.language || guessedLanguage.language === 'en') return

  // Log when we flag a message as being in an incorrect language.
  Localization.logger.log('info', 'Flagging non-English usage', {
    adjustedContent,
    channelId: channel.id,
    content,
    guessedLanguage,
    messageId: interaction.id,
  })

  // If the guessed language is not a language we have an international channel for, return the
  // generic English response about rule 3.1.
  const languageObject = LANGUAGE_OBJECTS.find(languageObject => {
    // If the guessed language is a language we support or a regional variant of one of them (for
    // instance Portuguese instead of Brazilian Portuguese or non-simplified Chinese), return the
    // similar variant.
    return languageObject.locale.startsWith(guessedLanguage.language)
  })
  const inEnglish = ENGLISH_LANGUAGE_OBJECT.messages.internationalization
  if (!languageObject) return interaction.reply(inEnglish)

  const i18nChannel = Discord.getChannelByName(guild, languageObject.channel)
  const link = i18nChannel ? channelMention(i18nChannel.id) : languageObject.channel
  const inLanguage = languageObject.messages.internationalization
  const message = [
    `${bold(languageObject.languageName)}: ${inLanguage.replace('%s', link)}`,
    `${bold(ENGLISH_LANGUAGE_OBJECT.languageName)}: ${inEnglish}`,
  ].join('\n\n')

  return interaction.reply(message)
}
