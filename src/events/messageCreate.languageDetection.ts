import { bold, channelMention, type GuildBasedChannel } from 'discord.js'

import { ENGLISH_LANGUAGE_OBJECT, LANGUAGE_OBJECTS } from '../constants/i18n'
import { BOT_TEST_CHANNEL_ID } from '../constants/discord'
import { IS_DEV } from '../constants/config'
import type { EnsuredInteraction } from './messageCreate'

const INCLUDED_CATEGORY_IDS = [
  /* General */ '1239259552357158942',
  /* Bug report */ '1239437158247567360',
  /* Feedback */ '1271841974994993224',
  /* Weapons */ '1262801739829219511',
  /* General (test) */ IS_DEV && '714858253531742209',
  /* FAQ (test) */ IS_DEV && '1373344771552317532',
].filter(Boolean)

export async function languageDetection(
  interaction: EnsuredInteraction,
  channel: GuildBasedChannel
) {
  const { guild, client } = interaction

  // Remove URLs from the message before performing language detection as to not
  // consider URL content.
  const content = interaction.content.replace(/https?:\/\/[\n\S]+/g, '').trim()

  // If the current channel does not belong to a listed category (by being top-
  // level or by belonging to a category that’s not listed), return early. An
  // exception is made to the bot testing channel.
  if (!channel.parentId) return
  const isTestChannel = channel.id === BOT_TEST_CHANNEL_ID
  const isInRelevantCategory = INCLUDED_CATEGORY_IDS.includes(channel.parentId)
  if (!isTestChannel && !isInRelevantCategory) return

  const crowdinCode = client.localizationManager.guessLanguageWithCld3(content)

  // If the guessed language is not unknown or unreliable, return early as it’s
  // better to have a false negative than a false positive.
  // If the guessed language is English, return early as there is nothing to do.
  if (!crowdinCode || crowdinCode === 'en') return

  // If the guessed language is not a language we have an international channel
  // for, return the generic English response about rule 3.1.
  const languageObject = LANGUAGE_OBJECTS.find(
    languageObject => languageObject.crowdinCode === crowdinCode
  )
  const inEnglish = ENGLISH_LANGUAGE_OBJECT.messages.internationalization
  if (!languageObject) return interaction.reply(inEnglish)

  const i18nChannel = guild.channels.cache.find(
    ({ name }) => name === languageObject.channel
  )
  const link = i18nChannel
    ? channelMention(i18nChannel.id)
    : languageObject.channel
  const inLanguage = languageObject.messages.internationalization
  const message = [
    `${bold(languageObject.languageName)}: ${inLanguage.replace('%s', link)}`,
    `${bold(ENGLISH_LANGUAGE_OBJECT.languageName)}: ${inEnglish}`,
  ].join('\n\n')

  return interaction.reply(message)
}
