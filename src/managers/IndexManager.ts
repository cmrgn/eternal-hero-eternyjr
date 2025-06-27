import { Events, type AnyThreadChannel, type Client } from 'discord.js'
import {
  Pinecone,
  type Index,
  type RecordMetadata,
} from '@pinecone-database/pinecone'

import type { ResolvedThread } from './FAQManager'
import type { PineconeEntry, PineconeNamespace } from './SearchManager'
import type { LanguageObject } from '../constants/i18n'
import { IS_DEV, PINECONE_API_KEY } from '../constants/config'
import { logger } from '../utils/logger'
import { withRetries } from '../utils/withRetries'

export class IndexManager {
  // This is the name of the index on Pinecone
  #indexName = 'faq-index'

  // This is intended to avoid polluting the production indexes during
  // development; this will create the same indexes as production, but prefixed
  // with this prefix
  #namespacePrefix = IS_DEV ? 'test-' : ''

  index: Index<RecordMetadata>
  client: Client

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('IndexManager', this.#severityThreshold)

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
      entry_indexed_at: new Date().toISOString(),
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
    this.#log('info', 'Indexing entries', {
      count,
      namespace: this.resolveNamespaceName(namespaceName),
    })

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

  async translateAndIndexThreadInAllLanguages(
    thread: ResolvedThread,
    concurrency = 10
  ) {
    this.#log('info', 'Indexing thread in all languages', {
      action: 'UPSERT',
      id: thread.id,
      concurrency,
    })

    return this.client.crowdinManager.onCrowdinLanguages(
      language => this.translateAndIndexThread(thread, language),
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

  unindexThreadInAllLanguages(threadId: string, concurrency = 20) {
    this.#log('info', 'Indexing thread in all languages', {
      action: 'DELETE',
      id: threadId,
      concurrency,
    })

    return this.client.crowdinManager.onCrowdinLanguages(
      ({ crowdinCode }) => this.unindexThread(threadId, crowdinCode),
      { concurrency }
    )
  }

  translateAndIndexThread(
    thread: ResolvedThread,
    languageObject: LanguageObject,
    options?: { retries?: number; backoffMs?: number }
  ) {
    const { retries = 3, backoffMs = 3000 } = options ?? {}
    const lm = this.client.localizationManager
    const { crowdinCode } = languageObject

    return withRetries(
      async () => {
        if (crowdinCode === 'en') return this.indexThread(thread, crowdinCode)
        const response = await lm.translateThread(thread, languageObject)
        await this.indexThread({ ...thread, ...response }, crowdinCode)
      },
      { retries, backoffMs, label: thread.name }
    )
  }

  bindEvents() {
    this.#log('info', 'Binding events onto the manager instance')

    this.client.faqManager.on(
      Events.ThreadCreate,
      this.translateAndIndexThreadInAllLanguages.bind(this)
    )
    this.client.faqManager.on(
      Events.ThreadDelete,
      this.unindexThreadInAllLanguages.bind(this)
    )
    this.client.faqManager.on(
      Events.ThreadUpdate,
      this.translateAndIndexThreadInAllLanguages.bind(this)
    )
  }
}

export const initIndexManager = (client: Client) => {
  const indexManager = new IndexManager(client)
  indexManager.bindEvents()
  return indexManager
}
