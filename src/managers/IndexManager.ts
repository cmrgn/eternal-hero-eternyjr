import type { Client } from 'discord.js'
import {
  Pinecone,
  type Index,
  type RecordMetadata,
} from '@pinecone-database/pinecone'

import type { ResolvedThread } from './FAQManager'
import type { PineconeEntry, PineconeNamespace } from './SearchManager'
import type { LanguageObject } from '../constants/i18n'
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
    const { Discord } = this.#client.managers
    // This is intended to avoid polluting the production indexes during
    // development; this will create the same indexes as production, but
    // prefixed with this prefix
    const prefix = Discord.IS_DEV ? 'test-' : ''
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

  bindEvents() {
    this.#log('info', 'Binding events onto the manager instance')
    const { Flags, Faq, Discord, Crowdin } = this.#client.managers

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
          await Discord.confirmThreadRetranslation(
            Crowdin.getLanguages({ withEnglish: false }),
            thread,
            message,
            oldMessage
          )
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
