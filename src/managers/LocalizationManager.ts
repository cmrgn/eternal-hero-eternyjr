import { type LanguageIdentifier, loadModule } from 'cld3-asm'
import type { Client } from 'discord.js'
import { CROWDIN_CODES, type CrowdinCode, type LanguageObject } from '../constants/i18n'
import { getExcerpt } from '../utils/getExcerpt'
import type { ResolvedThread } from './FAQManager'
import { LogManager, type Severity } from './LogManager'

export type LocalizationItem = {
  key: string
  translations: Record<CrowdinCode, string>
}

export class LocalizationManager {
  #client: Client

  #languageIdentifier: LanguageIdentifier | undefined

  #logger: LogManager

  constructor(client: Client, severity: Severity = 'info') {
    this.#logger = new LogManager('LocalizationManager', severity)
    this.#logger.log('info', 'Instantiating manager')

    this.#client = client
    this.loadLanguageIdentifier()
  }

  async loadLanguageIdentifier() {
    this.#logger.log('info', 'Loading language identifier')
    this.#languageIdentifier = (await loadModule()).create(40)
  }

  static isOnCrowdin(language: string): language is CrowdinCode {
    return CROWDIN_CODES.includes(language as CrowdinCode)
  }

  guessLanguageWithCld3(userInput: string) {
    if (!this.#languageIdentifier) return null

    const guess = this.#languageIdentifier.findLanguage(userInput)

    this.#logger.log('debug', 'Guessing language with cld3', {
      guess,
      userInput: getExcerpt(userInput),
    })

    if (guess.probability >= 0.95 && guess.language !== 'und') {
      return guess.language
    }

    return null
  }

  async guessLanguageWithChatGPT(userInput: string) {
    this.#logger.log('info', 'Guessing language with ChatGPT', { userInput })

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
      this.#logger.log('warn', 'ChatGPT could not guess the locale', context)
      return null
    }

    if (response === 'UNSUPPORTED') {
      this.#logger.log('warn', 'ChatGPT could not get a supported locale', context)
      return null
    }

    if (!LocalizationManager.isOnCrowdin(response)) {
      this.#logger.log('warn', 'ChatGPT returned an unsupported locale', context)
      return null
    }

    return response ?? null
  }

  async guessCrowdinLanguage(userInput: string): Promise<CrowdinCode | null> {
    this.#logger.log('info', 'Guessing Crowdin language', { userInput: getExcerpt(userInput) })

    const cldGuess = this.guessLanguageWithCld3(userInput)
    if (cldGuess && LocalizationManager.isOnCrowdin(cldGuess)) return cldGuess

    const gptGuess = await this.guessLanguageWithChatGPT(userInput)
    if (gptGuess) return gptGuess

    return null
  }

  async translateThread(thread: ResolvedThread, languageObject: LanguageObject) {
    const { DeepL } = this.#client.managers
    const targetLangCode = languageObject.deepLCode

    this.#logger.log('info', 'Translating thread with DeepL', {
      targetLang: targetLangCode,
      threadId: thread.id,
    })

    // If the thread has a single message, we can translate the thread name and the thread content
    // in a single DeepL query for performance.
    if (thread.messages.length === 1) {
      const message = thread.messages[0]
      const input = `${thread.name}\n${message.content}`
      const translation = await DeepL.translate(input, targetLangCode)
      const [name, ...content] = translation.split('\n')

      return { messages: [{ ...message, content: content.join('\n') }], name }
    }

    const [name, ...messages] = await Promise.all([
      DeepL.translate(thread.name, targetLangCode),
      ...thread.messages.map(({ content }) => DeepL.translate(content, targetLangCode)),
    ])

    return {
      messages: thread.messages.map((message, index) => ({
        ...message,
        content: messages[index],
      })),
      name,
    }
  }
}
