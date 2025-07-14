import type { Client } from 'discord.js'
import { type LanguageIdentifier, loadModule } from 'cld3-asm'

import { type CrowdinCode, CROWDIN_CODES, type LanguageObject } from '../constants/i18n'
import type { ResolvedThread } from './FAQManager'
import { logger } from '../utils/logger'

export type LocalizationItem = {
  key: string
  translations: Record<CrowdinCode, string>
}

export class LocalizationManager {
  #client: Client

  #languageIdentifier: LanguageIdentifier | undefined

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('LocalizationManager', this.#severityThreshold)

  constructor(client: Client) {
    this.#log('info', 'Instantiating manager')
    this.#client = client
    this.loadLanguageIdentifier()
  }

  async loadLanguageIdentifier() {
    this.#log('info', 'Loading language identifier')
    this.#languageIdentifier = (await loadModule()).create(40)
  }

  static isLanguageSupported(language: string): language is CrowdinCode {
    return CROWDIN_CODES.includes(language as CrowdinCode)
  }

  guessLanguageWithCld3(userInput: string) {
    // Commenting out this log since this function is called on *every* *single* message posted on
    // Discord. This is too verbose and pollutes the logs.
    // this.#log('info', 'Guessing language with cld3', { userInput })

    if (!this.#languageIdentifier) return null
    const guess = this.#languageIdentifier.findLanguage(userInput)

    if (
      guess.probability >= 0.9 &&
      guess.language !== 'und' &&
      LocalizationManager.isLanguageSupported(guess.language)
    ) {
      return guess.language
    }

    return null
  }

  async guessLanguageWithChatGPT(userInput: string) {
    this.#log('info', 'Guessing language with ChatGPT', { userInput })

    const { Prompt } = this.#client.managers
    const response = await Prompt.callChatCompletion(
      userInput,
      [
        'Return the ISO 639-1 code for the language of the message.',
        `You must respond with one of: ${CROWDIN_CODES}.`,
        'Only respond with UNSUPPORTED if there are no recognizable cues whatsoever.',
        'Do not explain your answer. Respond with a single code only.',
      ].join('\n')
    )

    const context = { guess: response, userInput }

    if (!response) {
      this.#log('warn', 'ChatGPT could not guess the locale', context)
      return null
    }

    if (response === 'UNSUPPORTED') {
      this.#log('warn', 'ChatGPT could not get a supported locale', context)
      return null
    }

    if (!LocalizationManager.isLanguageSupported(response)) {
      this.#log('warn', 'ChatGPT returned an unsupported locale', context)
      return null
    }

    return response ?? null
  }

  async guessCrowdinLanguage(userInput: string): Promise<CrowdinCode | null> {
    const cldGuess = this.guessLanguageWithCld3(userInput)
    if (cldGuess) return cldGuess

    const gptGuess = await this.guessLanguageWithChatGPT(userInput)
    if (gptGuess) return gptGuess

    return null
  }

  async translateThread(thread: ResolvedThread, languageObject: LanguageObject) {
    const { DeepL } = this.#client.managers
    const targetLangCode = languageObject.deepLCode

    this.#log('info', 'Translating thread with DeepL', {
      threadId: thread.id,
      targetLang: targetLangCode,
    })

    // If the thread has a single message, we can translate the thread name and the thread content
    // in a single DeepL query for performance.
    if (thread.messages.length === 1) {
      const message = thread.messages[0]
      const input = `${thread.name}\n${message.content}`
      const translation = await DeepL.translate(input, targetLangCode)
      const [name, ...content] = translation.split('\n')

      return { name, messages: [{ ...message, content: content.join('\n') }] }
    }

    const [name, ...messages] = await Promise.all([
      DeepL.translate(thread.name, targetLangCode),
      ...thread.messages.map(({ content }) => DeepL.translate(content, targetLangCode)),
    ])

    return {
      name,
      messages: thread.messages.map((message, index) => ({
        ...message,
        content: messages[index],
      })),
    }
  }
}
