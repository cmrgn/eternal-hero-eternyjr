import type { Client } from 'discord.js'
import * as deepl from 'deepl-node'
import { type LanguageIdentifier, loadModule } from 'cld3-asm'

import { DEEPL_API_KEY, DEEPL_GLOSSARY_ID } from '../constants/config'
import {
  type CrowdinCode,
  CROWDIN_CODES,
  type LanguageObject,
} from '../constants/i18n'
import type { ResolvedThread } from './FAQManager'
import { logger } from '../utils/logger'

export type LocalizationItem = {
  key: string
  translations: Record<CrowdinCode, string>
}

export class LocalizationManager {
  client: Client
  deepl: deepl.DeepLClient
  languageIdentifier: LanguageIdentifier | undefined

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('LocalizationManager', this.#severityThreshold)

  constructor(client: Client) {
    this.#log('info', 'Instantiating manager')

    if (!DEEPL_API_KEY) {
      throw new Error('Missing environment variable DEEPL_API_KEY; aborting.')
    }

    this.client = client
    this.deepl = new deepl.DeepLClient(DEEPL_API_KEY)
    this.loadLanguageIdentifier()
  }

  async loadLanguageIdentifier() {
    this.#log('info', 'Loading language identifier')
    this.languageIdentifier = (await loadModule()).create(40)
  }

  isLanguageSupported(language: string): language is CrowdinCode {
    return CROWDIN_CODES.includes(language as CrowdinCode)
  }

  guessLanguageWithCld3(userInput: string) {
    // Commenting out this log since this function is called on *every* *single*
    // message posted on Discord. This is too verbose and pollutes the logs.
    // this.#log('info', 'Guessing language with cld3', { userInput })

    if (!this.languageIdentifier) return null
    const guess = this.languageIdentifier.findLanguage(userInput)

    if (
      guess.probability >= 0.9 &&
      guess.language !== 'und' &&
      this.isLanguageSupported(guess.language)
    ) {
      return guess.language
    }

    return null
  }

  async guessLanguageWithChatGPT(userInput: string) {
    this.#log('info', 'Guessing language with ChatGPT', { userInput })

    const response = await this.client.promptManager.promptGPT(
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

    if (!this.isLanguageSupported(response)) {
      this.#log('warn', 'ChatGPT returned an unsupported locale', context)
      return null
    }

    return response ?? null
  }

  guessCrowdinLanguage(userInput: string) {
    return (
      this.guessLanguageWithCld3(userInput) ??
      this.guessLanguageWithChatGPT(userInput)
    )
  }

  async translateThread(
    thread: ResolvedThread,
    languageObject: LanguageObject
  ): Promise<{ name: string; content: string }> {
    this.#log('info', 'Translating thread with DeepL', {
      threadId: thread.id,
      targetLang: languageObject.deepLCode,
    })

    if ((await this.client.flagsManager.getFeatureFlag('deepl')) === false) {
      throw new Error('DeepL usage is disabled; aborting.')
    }

    // DeepL is quite agressive with line breaks and tend to remove them, which
    // is a problem when handling lists. A workaround is to give it a bunch of
    // individual chunks, and concatenate them back with a line break.
    const chunks = [thread.name, ...thread.content.split('\n').filter(Boolean)]
    const targetLangCode = languageObject.deepLCode
    const [name, ...content] = await this.deepl.translateText(
      chunks,
      'en',
      targetLangCode,
      {
        preserveFormatting: true,
        splitSentences: 'off',
        formality: 'prefer_less',
        modelType: 'quality_optimized',
        glossary: DEEPL_GLOSSARY_ID,
      }
    )

    return { name: name.text, content: content.map(c => c.text).join('\n') }
  }
}

export const initLocalizationManager = (client: Client) => {
  const localizationManager = new LocalizationManager(client)
  return localizationManager
}
