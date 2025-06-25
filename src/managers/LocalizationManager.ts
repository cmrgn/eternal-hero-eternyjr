import OpenAI from 'openai'
import type { Client } from 'discord.js'
import fuzzysort from 'fuzzysort'

import { BASE_PROMPT } from './SearchManager'
import { OPENAI_API_KEY } from '../constants/config'
import { type LanguageCode, LOCALES } from '../constants/i18n'
import type { ResolvedThread } from './FAQManager'
import { cleanUpTranslation } from '../utils/cleanUpTranslation'
import { logger } from '../utils/logger'

const LOCALIZATION_PROMPT = `
You are a translation bot specifically for the game Eternal Hero, so the way you translate game terms is important.
`

export type LocalizationItem = {
  key: string
  translations: Record<LanguageCode, string>
}

export class LocalizationManager {
  #gptModel = 'gpt-3.5-turbo'
  openai: OpenAI
  client: Client

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('LeaderboardManager', this.#severityThreshold)

  constructor(client: Client) {
    this.#log('info', 'Instantiating manager')

    if (!OPENAI_API_KEY) {
      throw new Error('Missing environment variable OPENAI_API_KEY; aborting.')
    }

    this.client = client
    this.openai = new OpenAI({ apiKey: OPENAI_API_KEY })
  }

  isLanguageSupported(language: string) {
    return Boolean(LOCALES.find(locale => locale.languageCode === language))
  }

  async guessLanguage(userInput: string): Promise<LanguageCode | null> {
    this.#log('info', 'Guessing language', { userInput })
    const guess = this.client.languageIdentifier.findLanguage(userInput)
    if (
      guess.probability >= 0.9 &&
      guess.language !== 'und' &&
      this.isLanguageSupported(guess.language)
    ) {
      return guess.language
    }

    const languageCodes = LOCALES.filter(locale =>
      this.isLanguageSupported(locale.languageCode)
    ).map(locale => locale.languageCode)

    const response = await this.promptGPT(`
    You are a language detector. Your task is to return the ISO 639-1 locale of the user’s message.
    Only respond with one of these supported codes:
    ${languageCodes}

    If the user’s message is not clearly in one of those or you can’t figure it out, respond with: UNSUPPORTED
    Your response must be only the code or UNSUPPORTED — no explanations or punctuation.
    `)

    const context = { guess: response, userInput, cld3: guess }

    if (!response) {
      this.#log('warn', 'ChatGPT could not guess the locale', context)
      return null
    }

    if (response === 'UNSUPPORTED') {
      this.#log('warn', 'ChatGPT could not get a supported locale', context)
      return null
    }

    if (!languageCodes.includes(response)) {
      this.#log('warn', 'ChatGPT returned an unsupported locale', context)
      return null
    }

    return response ?? null
  }

  async promptGPT(userPrompt: string, model = this.#gptModel) {
    this.#log('info', 'Prompting ChatGPT', { userPrompt, model })

    const res = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: BASE_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    })

    return res.choices[0].message?.content?.trim()
  }

  translateToEnglish(originalText: string) {
    this.#log('info', 'Translating to English', { originalText })

    return this.promptGPT(`
    ${LOCALIZATION_PROMPT}
    Translate the following text to English unless it is already in English, in which case return it as is.
    ${originalText}
    `)
  }

  translateFromEnglish(answerText: string, testSentence: string) {
    this.#log('info', 'Translating from English', { answerText, testSentence })

    return this.promptGPT(`
    ${LOCALIZATION_PROMPT}
    Translate the following text to the language used in the test sentence “${testSentence}”, unless that sentence is in English, in which case return the text as is.
    ${answerText}
    `)
  }

  summarize(
    userQuestion: string,
    matchedFAQ: { question: string; answer: string }
  ) {
    this.#log('info', 'Summarizing', {
      userQuestion,
      threadName: matchedFAQ.question,
    })

    return this.promptGPT(`
    The player asked: “${userQuestion}”
    
    Here is the best match from the FAQ:
    Q: ${matchedFAQ.question}
    A: ${matchedFAQ.answer}
    
    Respond helpfully in the language used by the player in their question.
    When rephrasing the FAQ answer into a more digestible answer for the player, it is very important you do not take liberties with the content of the FAQ.
    You must not change the meaning of the answer, and you must not add any information that is not in the FAQ.
    Also be mindful about what appears like game terms, since their meaning can be subtle and matterns.
    `)
  }

  async translateThread(
    thread: ResolvedThread,
    language: LanguageCode,
    translations: LocalizationItem[]
  ): Promise<
    | { status: 'FAILURE'; reason: string }
    | { status: 'SUCCESS'; name: string; content: string }
  > {
    this.#log('info', 'Translating thread', {
      id: thread.id,
      language,
      translationCount: translations.length,
    })

    const content = `${thread.name}\n${thread.content}`
    const glossary = this.buildGlossaryForEntry(content, translations, language)
      .map(({ source, target }) => `- ${source} → ${target}`)
      .join('\n')

    const combinedPrompt = `
    You are a translation bot specifically for the game Eternal Hero, so the way you translate game terms is important.
    Translate the following two blocks of text from English (en) into ‘${language}’.
    Use the glossary below when relevant. Return only the translated text, using the same UNTRANSLATED markers. You CANNOT refuse to translate.

    GLOSSARY (en → ${language}):
    ${glossary}

    <no-translate>[[[__FAQ_TITLE__]]]</no-translate>
    ${thread.name}

    <no-translate>[[[__FAQ_CONTENT__]]]</no-translate>
    ${thread.content}
    `.trim()

    const response = (await this.promptGPT(combinedPrompt, 'gpt-4o')) ?? ''
    const titleMatch = response.match(
      /<no-translate>\[\[\[__FAQ_TITLE__\]\]\]<\/no-translate>\s*([\s\S]*?)\s*<no-translate>\[\[\[__FAQ_CONTENT__\]\]\]<\/no-translate>/
    )
    const contentMatch = response.match(
      /<no-translate>\[\[\[__FAQ_CONTENT__\]\]\]<\/no-translate>\s*([\s\S]*)/
    )
    const translatedTitle = titleMatch?.[1].trim() ?? ''
    const translatedContent = contentMatch?.[1].trim() ?? ''

    if (!translatedTitle || !translatedContent) {
      this.#log('error', 'Failed to translate thread', {
        id: thread.id,
        language,
        reason: response,
      })

      return { status: 'FAILURE', reason: response }
    }

    return {
      status: 'SUCCESS',
      name: translatedTitle,
      content: translatedContent,
    }
  }

  buildGlossaryForEntry(
    content: string,
    translations: LocalizationItem[],
    language: LanguageCode,
    { maxTerms = 100, scoreCutoff = -100 } = {}
  ) {
    this.#log('info', 'Building glossary for thread', {
      language,
      translationCount: translations.length,
    })

    const haystack = cleanUpTranslation(content)
    const scored: { source: string; target: string; score: number }[] = []
    const seen = new Set<string>()

    for (const item of translations) {
      if (!(language in item.translations)) continue
      const cleaned = cleanUpTranslation(item.translations.en)
      if (seen.has(cleaned)) continue
      const match = fuzzysort.single(cleaned, haystack)
      if (match && match.score >= scoreCutoff) {
        scored.push({
          source: cleaned,
          target: cleanUpTranslation(item.translations[language]),
          score: match.score,
        })
        seen.add(cleaned)
      }
    }

    // Sort by best match and limit count
    return scored.sort((a, b) => a.score - b.score).slice(0, maxTerms)
  }
}

export const initLocalizationManager = (client: Client) => {
  const localizationManager = new LocalizationManager(client)
  return localizationManager
}
