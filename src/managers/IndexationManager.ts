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
import { PINECONE_API_KEY } from '../constants/config'
import { logger } from '../utils/logger'
import { withRetries } from '../utils/withRetries'

class IndexationManager {
  // This is the name of the index on Pinecone
  #INDEX_NAME = 'faq-index'
  index: Index<RecordMetadata>
  client: Client

  constructor(client: Client) {
    this.client = client
    this.index = new Pinecone({ apiKey: PINECONE_API_KEY ?? '_' }).index(
      this.#INDEX_NAME
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

  async indexRecords(entries: PineconeEntry[], namespace: PineconeNamespace) {
    const count = entries.length
    while (entries.length) {
      const batch = entries.splice(0, 90)
      await this.index.namespace(namespace).upsertRecords(batch)
    }
    return count
  }

  async indexThread(
    thread: AnyThreadChannel | ResolvedThread,
    namespace: PineconeNamespace
  ) {
    const threadId = thread.id
    const isResolved = 'isResolved' in thread && thread.isResolved
    const resolvedThread = isResolved
      ? thread
      : await this.client.faqManager.resolveThread(thread)
    const record = this.prepareForIndexing(resolvedThread)
    await this.indexRecords([record], namespace)
    logger.info('INDEXING', { action: 'UPSERT', id: threadId, namespace })
  }

  async indexThreadInAllLanguages(thread: ResolvedThread) {
    const { crowdinManager } = this.client
    const translations = await crowdinManager.fetchAllProjectTranslations()
    for (const { isOnCrowdin, languageCode } of LOCALES) {
      if (!isOnCrowdin && languageCode !== 'en') continue
      const indexThread = this.threadIndexer(languageCode, translations)
      await indexThread(thread)
    }
  }

  async unindexThread(threadId: string, namespace: PineconeNamespace) {
    try {
      await this.index.namespace(namespace).deleteOne(threadId)
      logger.info('INDEXING', { action: 'DELETE', id: threadId, namespace })
    } catch (error) {
      // Unindexing may fail with a 404 if the resource didn’t exist in the
      // index to begin with
      const isError = error instanceof Error
      if (!isError || !error.message.includes('404')) throw error
    }
  }

  async unindexThreadInAllLanguages(threadId: string) {
    for (const { isOnCrowdin, languageCode } of LOCALES) {
      if (!isOnCrowdin) continue
      await this.unindexThread(threadId, languageCode)
    }
  }

  threadIndexer(
    language: LanguageCode,
    translations: LocalizationItem[],
    events?: {
      onThread?: (thread: ResolvedThread) => void
      onTranslationFailure?: (thread: ResolvedThread, reason: string) => void
    },
    options?: { retries?: number; backoffMs?: number; label?: string }
  ) {
    return (thread: ResolvedThread) => {
      const {
        retries = 5,
        backoffMs = 3000,
        label = thread.name,
      } = options ?? {}
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
              await this.indexThread(
                { ...thread, name: response.name, content: response.content },
                language
              )
            } else {
              events?.onTranslationFailure?.(thread, response.reason)
            }
          }
        },
        { retries, backoffMs, label }
      )
    }
  }

  bindEvents() {
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
