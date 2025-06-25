import { Events, type AnyThreadChannel, type Client } from 'discord.js'
import {
  Pinecone,
  type Index,
  type RecordMetadata,
} from '@pinecone-database/pinecone'

import type { ResolvedThread } from './FAQManager'
import type { PineconeEntry, PineconeNamespace } from './SearchManager'
import type { LocalizationItem } from './LocalizationManager'
import { type LanguageCode, LOCALES } from '../constants/i18n'
import { IS_DEV, PINECONE_API_KEY } from '../constants/config'
import { logger } from '../utils/logger'
import { withRetries } from '../utils/withRetries'
import pMap from 'p-map'

export class IndexationManager {
  // This is the name of the index on Pinecone
  #indexName = 'faq-index'

  // This is intended to avoid polluting the production indexes during
  // development; this will create the same indexes as production, but prefixed
  // with this prefix
  #namespacePrefix = IS_DEV ? 'test-' : ''

  index: Index<RecordMetadata>
  client: Client

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('IndexationManager', this.#severityThreshold)

  constructor(client: Client) {
    this.#log('info', 'Instantiating manager')
    this.client = client
    this.index = new Pinecone({ apiKey: PINECONE_API_KEY ?? '_' }).index(
      this.#indexName
    )
  }

  prepareForIndexing(entry: ResolvedThread): PineconeEntry {
    return {
      id: `entry#${entry.id}`,
      chunk_text: `${entry.name}\n\n${entry.content}`,
      entry_question: entry.name,
      entry_answer: entry.content,
      entry_date: entry.createdAt ?? '',
      entry_tags: entry.tags,
      entry_url: entry.url,
    }
  }

  resolveNamespaceName(namespaceName: PineconeNamespace) {
    return this.#namespacePrefix + namespaceName
  }

  resolveNamespace(namespaceName: PineconeNamespace) {
    return this.index.namespace(this.resolveNamespaceName(namespaceName))
  }

  async indexRecords(
    entries: PineconeEntry[],
    namespaceName: PineconeNamespace
  ) {
    const count = entries.length
    const namespace = this.resolveNamespace(namespaceName)
    this.#log('info', 'Indexing entries', { count, namespace })

    while (entries.length) {
      const batch = entries.splice(0, 90)
      await namespace.upsertRecords(batch)
    }

    return count
  }

  async indexThread(
    thread: AnyThreadChannel | ResolvedThread,
    namespaceName: PineconeNamespace
  ) {
    this.#log('info', 'Indexing thread', { action: 'UPSERT', id: thread.id })

    const isResolved = 'isResolved' in thread && thread.isResolved
    const resolvedThread = isResolved
      ? thread
      : await this.client.faqManager.resolveThread(thread)
    const record = this.prepareForIndexing(resolvedThread)
    await this.indexRecords([record], namespaceName)
  }

  async indexThreadInAllLanguages(thread: ResolvedThread, concurrency = 3) {
    const { crowdinManager } = this.client
    const translations = await crowdinManager.fetchAllProjectTranslations()
    this.#log('info', 'Indexing thread in all languages', {
      action: 'UPSERT',
      id: thread.id,
      concurrency,
    })

    await pMap(
      LOCALES,
      async ({ isOnCrowdin, languageCode }) => {
        if (!isOnCrowdin && languageCode !== 'en') return
        const indexThread = this.threadIndexer(languageCode, translations)
        await indexThread(thread)
      },
      { concurrency }
    )
  }

  async unindexThread(threadId: string, namespaceName: PineconeNamespace) {
    try {
      this.#log('info', 'Indexing thread', {
        action: 'DELETE',
        id: threadId,
        namespace: this.resolveNamespaceName(namespaceName),
      })
      await this.resolveNamespace(namespaceName).deleteOne(threadId)
    } catch (error) {
      // Unindexing may fail with a 404 if the resource didn’t exist in the
      // index to begin with
      const isError = error instanceof Error
      if (!isError || !error.message.includes('404')) throw error
    }
  }

  async unindexThreadInAllLanguages(threadId: string, concurrency = 3) {
    this.#log('info', 'Indexing thread in all languages', {
      action: 'DELETE',
      id: threadId,
      concurrency,
    })

    await pMap(
      LOCALES,
      async ({ isOnCrowdin, languageCode }) => {
        if (!isOnCrowdin && languageCode !== 'en') return
        await this.unindexThread(threadId, languageCode)
      },
      { concurrency }
    )
  }

  threadIndexer(
    language: LanguageCode,
    translations: LocalizationItem[],
    options?: {
      events?: {
        onThread?: (thread: ResolvedThread) => void
        onTranslationFailure?: (thread: ResolvedThread, reason: string) => void
      }
      backoff?: { retries?: number; backoffMs?: number }
    }
  ) {
    const { retries = 5, backoffMs = 3000 } = options?.backoff ?? {}
    const { events } = options ?? {}

    return (thread: ResolvedThread) => {
      return withRetries(
        async () => {
          await events?.onThread?.(thread)

          if (language === 'en') {
            await this.indexThread(thread, language)
          } else {
            const response =
              await this.client.localizationManager.translateThread(
                thread,
                language,
                translations
              )
            if (response.status === 'SUCCESS') {
              const localizedThread = {
                ...thread,
                name: response.name,
                content: response.content,
              }
              await this.indexThread(localizedThread, language)
            } else {
              events?.onTranslationFailure?.(thread, response.reason)
            }
          }
        },
        { retries, backoffMs, label: thread.name }
      )
    }
  }

  bindEvents() {
    this.#log('info', 'Binding events onto the manager instance')

    this.client.faqManager.on(
      Events.ThreadCreate,
      this.indexThreadInAllLanguages.bind(this)
    )
    this.client.faqManager.on(
      Events.ThreadDelete,
      this.unindexThreadInAllLanguages.bind(this)
    )
    this.client.faqManager.on(
      Events.ThreadUpdate,
      this.indexThreadInAllLanguages.bind(this)
    )
  }
}

export const initIndexationManager = (client: Client) => {
  const indexationManager = new IndexationManager(client)
  indexationManager.bindEvents()
  return indexationManager
}
