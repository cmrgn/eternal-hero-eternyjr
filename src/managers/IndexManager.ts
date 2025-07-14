import { type Index, Pinecone, type RecordMetadata } from '@pinecone-database/pinecone'
import type { Client } from 'discord.js'
import type { CrowdinCode, LanguageObject } from '../constants/i18n'
import { logger } from '../utils/logger'
import { withRetry } from '../utils/withRetry'
import type { ResolvedThread } from './FAQManager'

export type PineconeMetadata = {
  entry_question: string
  entry_answer: string
  entry_tags: string[]
  entry_indexed_at: string
  entry_url: string
}
export type PineconeEntry = {
  id: string
  chunk_text: string
} & PineconeMetadata
export type PineconeNamespace = CrowdinCode

export class IndexManager {
  #client: Client
  index: Index<RecordMetadata>

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('IndexManager', this.#severityThreshold)

  constructor(client: Client) {
    this.#log('info', 'Instantiating manager')

    if (!process.env.PINECONE_API_KEY) {
      throw new Error('Missing environment variable PINECONE_API_KEY; aborting.')
    }

    this.#client = client
    this.index = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    }).index('faq-index')
  }

  static prepareForIndexing(entry: ResolvedThread): PineconeEntry[] {
    return entry.messages.map(message => ({
      chunk_text: `${entry.name}\n\n${message.content}`,
      entry_answer: message.content,
      entry_indexed_at: new Date().toISOString(),
      entry_question: entry.name,
      entry_tags: entry.tags,
      entry_url: message.id === entry.id ? entry.url : `${entry.url}/${message.id}`,
      // The index was originally built without considering multiple messages (and thus chunks) for
      // a given thread. To avoid ending up with multiple Pinecone entries for the same message (e.
      // g. a given FAQ thread indexed as `entry#<thread-id>` and `entry#<thread-id>#<message-id>`),
      // keep the old naming convention for the first message of every entry, and only add the
      // message ID if there is more than 1.
      id: message.id === entry.id ? `entry#${entry.id}` : `entry#${entry.id}#${message.id}`,
    }))
  }

  getNamespaceName(namespaceName: PineconeNamespace) {
    const { Discord } = this.#client.managers
    // This is intended to avoid polluting the production indexes during development; this will
    // create the same indexes as production, but prefixed with this prefix
    const prefix = Discord.IS_DEV ? 'test-' : ''
    return prefix + namespaceName
  }

  namespace(namespaceName: PineconeNamespace) {
    return this.index.namespace(this.getNamespaceName(namespaceName))
  }

  async indexRecords(entries: PineconeEntry[], namespaceName: PineconeNamespace) {
    const count = entries.length
    const namespace = this.namespace(namespaceName)

    this.#log('info', 'Indexing entries', {
      count,
      namespace: this.getNamespaceName(namespaceName),
    })

    while (entries.length) {
      const batch = entries.splice(0, 90)
      await withRetry(() => namespace.upsertRecords(batch))
    }

    return count
  }

  async indexThread(thread: ResolvedThread, namespaceName: PineconeNamespace) {
    this.#log('info', 'Indexing thread', { action: 'UPSERT', id: thread.id })

    const records = IndexManager.prepareForIndexing(thread)
    await this.indexRecords(records, namespaceName)
  }

  async translateAndIndexThreadInAllLanguages(thread: ResolvedThread) {
    const { Crowdin } = this.#client.managers

    this.#log('info', 'Indexing thread in all languages', {
      action: 'UPSERT',
      id: thread.id,
    })

    return Crowdin.onCrowdinLanguages(language => this.translateAndIndexThread(thread, language))
  }

  async unindexThread(threadId: string, namespaceName: PineconeNamespace) {
    try {
      await withRetry(attempt => {
        this.#log('info', 'Unindexing thread', {
          attempt,
          id: threadId,
          namespace: this.getNamespaceName(namespaceName),
        })

        return this.namespace(namespaceName).deleteMany({
          id: { $regex: `^entry#${threadId}` },
        })
      })
    } catch (error) {
      // Unindexing may fail with a 404 if the resource didn’t exist in the index to begin with
      const isError = error instanceof Error

      if (isError && error.message.includes('404')) {
        this.#log('info', 'Thread not found in index; skipping deletion', {
          namespace: this.getNamespaceName(namespaceName),
          threadId,
        })
      }

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

  async translateAndIndexThread(thread: ResolvedThread, languageObject: LanguageObject) {
    const { Localization } = this.#client.managers
    const { crowdinCode } = languageObject

    if (crowdinCode === 'en') return this.indexThread(thread, crowdinCode)

    const { name, messages } = await Localization.translateThread(thread, languageObject)
    await this.indexThread({ ...thread, messages, name }, crowdinCode)
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
