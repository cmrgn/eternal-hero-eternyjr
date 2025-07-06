import {
  type Message,
  type Client,
  type PartialMessage,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from 'discord.js'
import {
  Pinecone,
  type Index,
  type RecordMetadata,
} from '@pinecone-database/pinecone'
import { diffWords } from 'diff'

import type { ResolvedThread } from './FAQManager'
import type { PineconeEntry, PineconeNamespace } from './SearchManager'
import type { LanguageObject } from '../constants/i18n'
import { IS_DEV } from '../constants/config'
import { logger } from '../utils/logger'

export class IndexManager {
  #client: Client
  index: Index<RecordMetadata>

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('IndexManager', this.#severityThreshold)

  constructor(client: Client) {
    this.#log('info', 'Instantiating manager')

    if (!process.env.PINECONE_API_KEY) {
      throw new Error(
        'Missing environment variable PINECONE_API_KEY; aborting.'
      )
    }

    this.#client = client
    this.index = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    }).index('faq-index')
  }

  prepareForIndexing(entry: ResolvedThread): PineconeEntry {
    return {
      id: `entry#${entry.id}`,
      chunk_text: `${entry.name}\n\n${entry.content}`,
      entry_question: entry.name,
      entry_answer: entry.content,
      entry_indexed_at: new Date().toISOString(),
      entry_tags: entry.tags,
      entry_url: entry.url,
    }
  }

  getNamespaceName(namespaceName: PineconeNamespace) {
    // This is intended to avoid polluting the production indexes during
    // development; this will create the same indexes as production, but
    // prefixed with this prefix
    const prefix = IS_DEV ? 'test-' : ''
    return prefix + namespaceName
  }

  namespace(namespaceName: PineconeNamespace) {
    return this.index.namespace(this.getNamespaceName(namespaceName))
  }

  async indexRecords(
    entries: PineconeEntry[],
    namespaceName: PineconeNamespace
  ) {
    const count = entries.length
    const namespace = this.namespace(namespaceName)

    this.#log('info', 'Indexing entries', {
      count,
      namespace: this.getNamespaceName(namespaceName),
    })

    while (entries.length) {
      const batch = entries.splice(0, 90)
      await namespace.upsertRecords(batch)
    }

    return count
  }

  async indexThread(thread: ResolvedThread, namespaceName: PineconeNamespace) {
    this.#log('info', 'Indexing thread', { action: 'UPSERT', id: thread.id })

    const record = this.prepareForIndexing(thread)
    await this.indexRecords([record], namespaceName)
  }

  async translateAndIndexThreadInAllLanguages(thread: ResolvedThread) {
    const { Crowdin } = this.#client.managers

    this.#log('info', 'Indexing thread in all languages', {
      action: 'UPSERT',
      id: thread.id,
    })

    return Crowdin.onCrowdinLanguages(language =>
      this.translateAndIndexThread(thread, language)
    )
  }

  async unindexThread(threadId: string, namespaceName: PineconeNamespace) {
    try {
      this.#log('info', 'Indexing thread', {
        action: 'DELETE',
        id: threadId,
        namespace: this.getNamespaceName(namespaceName),
      })
      await this.namespace(namespaceName).deleteOne(threadId)
    } catch (error) {
      // Unindexing may fail with a 404 if the resource didn’t exist in the
      // index to begin with
      const isError = error instanceof Error
      if (!isError || !error.message.includes('404')) throw error
    }
  }

  unindexThreadInAllLanguages(threadId: string) {
    const { Crowdin } = this.#client.managers

    this.#log('info', 'Indexing thread in all languages', {
      action: 'DELETE',
      id: threadId,
    })

    return Crowdin.onCrowdinLanguages(({ crowdinCode }) =>
      this.unindexThread(threadId, crowdinCode)
    )
  }

  async translateAndIndexThread(
    thread: ResolvedThread,
    languageObject: LanguageObject
  ) {
    const { Localization } = this.#client.managers
    const { crowdinCode } = languageObject

    if (crowdinCode === 'en') return this.indexThread(thread, crowdinCode)

    const { name, content } = await Localization.translateThread(
      thread,
      languageObject
    )
    await this.indexThread({ ...thread, name, content }, crowdinCode)
  }

  async confirmRetranslation(
    thread: ResolvedThread,
    message: Message<boolean>,
    oldMessage: Message<boolean> | PartialMessage
  ) {
    this.#log('info', 'Asking for translation confirmation', {
      id: thread.id,
    })

    const { Crowdin } = this.#client.managers
    const languageObjects = Crowdin.getLanguages({ withEnglish: false })
    const languageCount = languageObjects.length
    const char = message.content.length
    const numberFormatter = new Intl.NumberFormat('en-US')
    const currencyFormatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
    })
    // The previous content may not be defined if the message is a partial. We
    // cannot refetch it, because it will fetch the latest version of the mes-
    // sage which will yield a null diff. So either we have the old content in
    // the Discord cache and we can diff, or we can’t.
    const contentDiff = oldMessage.content
      ? diffWords(oldMessage.content, message.content)
          .map(part => {
            if (part.added) return `**${part.value}**`
            if (part.removed) return `~~${part.value}~~`
            return part.value
          })
          .join('')
      : ''
    const content = [
      'You have edited a FAQ entry. Do you want to automatically translate it in all supported languages and reindex it?',
      `- Entry: _“${thread.name}”_`,
      `- Language count: ${numberFormatter.format(languageCount)} (w/o English)`,
      `- Character count: ${numberFormatter.format(char)}`,
      `- **Total cost:** ${currencyFormatter.format((20 / 1_000_000) * char * languageCount)}`,
      contentDiff.replace(/\n/g, '\n> '),
    ].join('\n')

    const confirmBtn = new ButtonBuilder()
      .setCustomId(`confirm-retranslate:${thread.id}`)
      .setLabel('Yes, retranslate')
      .setStyle(ButtonStyle.Primary)
    const cancelBtn = new ButtonBuilder()
      .setCustomId(`skip-retranslate:${thread.id}`)
      .setLabel('No, skip')
      .setStyle(ButtonStyle.Secondary)
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      confirmBtn,
      cancelBtn
    )

    await message.author.send({ content, components: [row] })
  }

  bindEvents() {
    this.#log('info', 'Binding events onto the manager instance')
    const { Flags, Faq } = this.#client.managers

    Faq.on('ThreadCreated', async (thread: ResolvedThread) => {
      if (await Flags.getFeatureFlag('auto_indexing')) {
        await this.translateAndIndexThreadInAllLanguages(thread)
      } else {
        this.#log('info', 'Auto-indexing is disabled; aborting.', {
          threadId: thread.id,
        })
      }
    })

    Faq.on('ThreadDeleted', async (threadId: string) => {
      if (await Flags.getFeatureFlag('auto_indexing')) {
        await this.unindexThreadInAllLanguages(threadId)
      } else {
        this.#log('info', 'Auto-indexing is disabled; aborting.', { threadId })
      }
    })

    Faq.on('ThreadNameUpdated', async (thread: ResolvedThread) => {
      if (await Flags.getFeatureFlag('auto_indexing')) {
        await this.translateAndIndexThreadInAllLanguages(thread)
      } else {
        this.#log('info', 'Auto-indexing is disabled; aborting.', {
          threadId: thread.id,
        })
      }
    })

    Faq.on('ThreadContentUpdated', async (thread, message, oldMessage) => {
      if (await Flags.getFeatureFlag('auto_indexing')) {
        if ((await Flags.getFeatureFlag('auto_translation_confirm')) === true) {
          await this.confirmRetranslation(thread, message, oldMessage)
        } else {
          await this.translateAndIndexThreadInAllLanguages(thread)
        }
      } else {
        this.#log('info', 'Auto-indexing is disabled; aborting.', {
          thread: thread.id,
        })
      }
    })

    return this
  }
}
