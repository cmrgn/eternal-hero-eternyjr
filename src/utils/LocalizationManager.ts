import OpenAI from 'openai'
import type { Client } from 'discord.js'

import { BASE_PROMPT } from './SearchManager'
import { OPENAI_API_KEY } from '../constants/config'
import { type Locale, LOCALES } from '../constants/i18n'
import type { ResolvedThread } from './FAQManager'

const LOCALIZATION_PROMPT = `
You are a translation bot specifically for the game Eternal Hero, so the way you translate game terms is important.
`

export class LocalizationManager {
  #GPT_MODEL = 'gpt-3.5-turbo'
  openai: OpenAI
  client: Client

  constructor(client: Client) {
    if (!OPENAI_API_KEY) {
      throw new Error('Missing environment variable OPENAI_API_KEY; aborting.')
    }

    this.client = client
    this.openai = new OpenAI({ apiKey: OPENAI_API_KEY })
  }

  isLanguageSupported(language: string) {
    return Boolean(LOCALES.find(locale => locale.languageCode === language))
  }

  guessLanguage(userInput: string): Locale['languageCode'] | null {
    const guess = this.client.languageIdentifier.findLanguage(userInput)
    if (guess.probability < 0.9) return null
    if (guess.language === 'und') return null
    if (!this.isLanguageSupported(guess.language)) return null
    return guess.language
  }

  async promptGPT(userPrompt: string, model = this.#GPT_MODEL) {
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
    return this.promptGPT(`
    ${LOCALIZATION_PROMPT}
    Translate the following text to English unless it is already in English, in which case return it as is.
    ${originalText}
    `)
  }

  translateFromEnglish(answerText: string, testSentence: string) {
    return this.promptGPT(`
    ${LOCALIZATION_PROMPT}
    Translate the following text to the language used in the test sentence “${testSentence}”, unless that sentence is in English, in which case return the text as is.
    ${answerText}
    `)
  }

  translateFromEnglishAndRephrase(
    userQuestion: string,
    matchedFAQ: { question: string; answer: string }
  ) {
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

  async translateFAQEntry(
    ogThread: ResolvedThread,
    targetLanguage: Locale['languageCode']
  ) {
    const thread = structuredClone(ogThread)

    const combinedPrompt = `
    You are a translation bot specifically for the game Eternal Hero, so the way you translate game terms is important.
    Translate the following two blocks of text from English (en) into ‘${targetLanguage}’.
    Return only the translated text, using the same markers.
    
    <<FAQ_TITLE>>
    ${thread.name}
  
    <<FAQ_CONTENT>>
    ${thread.content}
    `.trim()

    const translation = (await this.promptGPT(combinedPrompt, 'gpt-4o')) ?? ''
    const titleMatch = translation.match(
      /<<FAQ_TITLE>>\s*([\s\S]*?)\s*<<FAQ_CONTENT>>/
    )
    const contentMatch = translation.match(/<<FAQ_CONTENT>>\s*([\s\S]*)/)
    const translatedTitle = titleMatch?.[1].trim() ?? ''
    const translatedContent = contentMatch?.[1].trim() ?? ''

    if (!translatedTitle || !translatedContent) return thread

    thread.name = translatedTitle
    thread.content = translatedContent

    return thread
  }
}

export const initLocalizationManager = (client: Client) => {
  const localizationManager = new LocalizationManager(client)
  return localizationManager
}
