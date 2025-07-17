import * as deepl from 'deepl-node'
import { GlossaryEntries } from 'deepl-node'
import type { Client } from 'discord.js'
import type { CrowdinCode } from '../constants/i18n'
import { getExcerpt } from '../utils/getExcerpt'
import { type LoggerSeverity, logger } from '../utils/logger'
import { withRetry } from '../utils/withRetry'
import type { LocalizationItem } from './LocalizationManager'

export class DeepLManager {
  #client: Client
  #deepl: deepl.DeepLClient
  #deepLGlossaryId = 'b88f1891-8a05-4d87-965f-67de6b825693'

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('DeepLManager', this.#severityThreshold)

  COST_PER_CHAR = 20 / 1_000_000

  constructor(client: Client, severity: LoggerSeverity = 'info') {
    this.#severityThreshold = logger.LOG_SEVERITIES.indexOf(severity)
    this.#log('info', 'Instantiating manager')

    if (!process.env.DEEPL_API_KEY) {
      throw new Error('Missing environment variable DEEPL_API_KEY; aborting.')
    }

    this.#client = client
    this.#deepl = new deepl.DeepLClient(process.env.DEEPL_API_KEY)
  }

  async ensureDeepLIsEnabled() {
    this.#log('info', 'Ensuring DeepL is enabled')

    const { Flags } = this.#client.managers
    const isEnabled = await Flags.getFeatureFlag('deepl', { severity: 'debug' })

    if (!isEnabled) throw new Error('DeepL usage is disabled; aborting.')
  }

  async translate(input: string, targetLangCode: deepl.TargetLanguageCode) {
    this.#log('info', 'Translating content with DeepL', {
      input: getExcerpt(input),
      targetLang: targetLangCode,
    })

    await this.ensureDeepLIsEnabled()

    if (!input.trim()) return ''

    // DeepL is quite agressive with line breaks and tends to remove them, which is a problem when
    // handling lists. A workaround is to give it a bunch of individual chunks, and concatenate them
    // back with a line break.
    const chunks = input.split('\n').filter(Boolean)

    const response = await withRetry(
      () =>
        this.#deepl.translateText(chunks, 'en', targetLangCode, {
          formality: 'prefer_less',
          glossary: this.#deepLGlossaryId,
          modelType: 'quality_optimized',
          preserveFormatting: true,
          splitSentences: 'off',
        }),
      { logFn: this.#log }
    )

    return response.map(chunk => chunk.text).join('\n')
  }

  async updateDeepLGlossary(translations: LocalizationItem[], targetLangCode: string) {
    this.#log('info', 'Updating the DeepL glossary', {
      count: translations.length,
      targetLang: targetLangCode,
    })

    await this.ensureDeepLIsEnabled()

    const pairs = this.formatPairs(translations, targetLangCode as CrowdinCode)
    if (pairs.length === 0) return

    await withRetry(
      () =>
        this.#deepl.updateMultilingualGlossaryDictionary(this.#deepLGlossaryId, {
          entries: new deepl.GlossaryEntries({
            entries: Object.fromEntries(pairs),
          }),
          sourceLangCode: 'en',
          targetLangCode,
        }),
      { logFn: this.#log }
    )
  }

  async getUsage() {
    const usage = await withRetry(
      attempt => {
        this.#log('info', 'Getting DeepL usage data', { attempt })
        return this.#deepl.getUsage()
      },
      { logFn: this.#log }
    )

    return { character: usage?.character?.count ?? 0 }
  }

  formatPairs(translations: LocalizationItem[], targetLangCode: CrowdinCode) {
    const ignoredPatterns = [
      // These 5 Item_*_Name keys are the five torso items, which are called “<Something> Chest” in
      // English. This causes translations to use that word when translating the word “chest” (as in
      // treasure chest). By excluding them from the glossary, we can improve translations for all
      // mentioning world chests.
      /Item_(?:29|37|44|52|60)_Name/,
      // Talents are typically long and contain replacement variables, which means they are not good
      // candidates for glossary entries
      /Talent_\d+_(?:Name|Desc)/,
    ]

    const errors: string[] = []

    const pairs = translations
      .filter(({ translations: t }) => !!t.en && !!t[targetLangCode])
      .map(({ key, translations: t }): [string, string] => {
        if (ignoredPatterns.some(re => re.test(key))) return ['', '']
        try {
          const cleanSource = cleanUpTranslation(t.en)
          const cleanTarget = cleanUpTranslation(t[targetLangCode])
          if (cleanSource.includes('{') || cleanTarget.includes('{'))
            throw new Error('Variable still present in string.')
          GlossaryEntries.validateGlossaryTerm(cleanSource)
          GlossaryEntries.validateGlossaryTerm(cleanTarget)
          return [cleanSource, cleanTarget]
        } catch (error) {
          errors.push(`Glossary key \`${key}\` failed: ${error?.toString()}`)
          return ['', '']
        }
      })
      .filter(([src, tgt]) => src && tgt)

    if (errors.length) {
      this.#log('warn', 'Some glossary pairs were skipped', { errors, targetLangCode })
    }

    return pairs
  }
}

function cleanUpTranslation(string: string) {
  return (
    string
      // Remove line breaks
      .replace(/\n/g, '')
      // Replace pluralization tokens with the singular form
      .replace(/\{0:plural:([^|}]+)\|[^}]+\}/g, (_, singular) => singular)
      // Remove tags
      .replace(/<[a-z=]+>/g, '')
      .replace(/<\/[a-z=]+>/g, '')
      .trim()
  )
}
