import OpenAI from 'openai'
import type { Client } from 'discord.js'

import { GPT_MODEL, BASE_PROMPT } from './SearchManager'
import { OPENAI_API_KEY } from '../constants/config'

const LOCALIZATION_PROMPT = `
You are a translation bot specifically for the game Eternal Hero, so the way you translate game terms is important.
`

export class LocalizationManager {
  openai: OpenAI

  constructor() {
    if (!OPENAI_API_KEY) {
      throw new Error('Missing environment variable OPENAI_API_KEY; aborting.')
    }

    this.openai = new OpenAI({ apiKey: OPENAI_API_KEY })
  }

  async translateToEnglish(originalText: string) {
    const res = await this.openai.chat.completions.create({
      model: GPT_MODEL,
      messages: [
        { role: 'system', content: BASE_PROMPT },
        {
          role: 'user',
          content: `
          ${LOCALIZATION_PROMPT}
          Translate the following text to English unless it is already in English, in which case return it as is.
          ${originalText}`,
        },
      ],
    })

    return res.choices[0].message?.content?.trim() ?? originalText
  }

  async translateFromEnglish(answerText: string, testSentence: string) {
    const response = await this.openai.chat.completions.create({
      model: GPT_MODEL,
      messages: [
        { role: 'system', content: BASE_PROMPT },
        {
          role: 'user',
          content: `
          ${LOCALIZATION_PROMPT}
          Translate the following text to the language used in the test sentence “${testSentence}”, unless that sentence is in English, in which case return the text as is.
          ${answerText}`,
        },
      ],
    })

    return response.choices[0].message?.content?.trim()
  }

  async translateFromEnglishAndRephrase(
    userQuestion: string,
    matchedFAQ: { question: string; answer: string }
  ) {
    const chat = await this.openai.chat.completions.create({
      model: GPT_MODEL,
      messages: [
        { role: 'system', content: BASE_PROMPT },
        {
          role: 'user',
          content: `
          The player asked: “${userQuestion}”
          
          Here is the best match from the FAQ:
          Q: ${matchedFAQ.question}
          A: ${matchedFAQ.answer}
          
          Respond helpfully in the language used by the player in their question.
          When rephrasing the FAQ answer into a more digestible answer for the player, it is very important you do not take liberties with the content of the FAQ.
          You must not change the meaning of the answer, and you must not add any information that is not in the FAQ.
          Also be mindful about what appears like game terms, since their meaning can be subtle and matterns.`,
        },
      ],
    })

    return chat.choices[0].message?.content
  }
}

export const initLocalizationManager = (client: Client) => {
  const localizationManager = new LocalizationManager()
  return localizationManager
}
