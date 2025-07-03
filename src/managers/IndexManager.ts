import type {
  Message,
  AnyThreadChannel,
  Client,
  PartialMessage,
} from 'discord.js'
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
import { diffWords } from 'diff'

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

  async translateAndIndexThreadInAllLanguages(thread: ResolvedThread) {
    this.#log('info', 'Indexing thread in all languages', {
      action: 'UPSERT',
      id: thread.id,
    })

    return this.client.crowdinManager.onCrowdinLanguages(language =>
      this.translateAndIndexThread(thread, language)
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

  unindexThreadInAllLanguages(threadId: string) {
    this.#log('info', 'Indexing thread in all languages', {
      action: 'DELETE',
      id: threadId,
    })

    return this.client.crowdinManager.onCrowdinLanguages(({ crowdinCode }) =>
      this.unindexThread(threadId, crowdinCode)
    )
  }

  async translateAndIndexThread(
    thread: ResolvedThread,
    languageObject: LanguageObject
  ) {
    const lm = this.client.localizationManager
    const { crowdinCode } = languageObject
    if (crowdinCode === 'en') return this.indexThread(thread, crowdinCode)
    const response = await lm.translateThread(thread, languageObject)
    await this.indexThread({ ...thread, ...response }, crowdinCode)
  }

  async confirmRetranslation(
    thread: ResolvedThread,
    message: Message<boolean>,
    oldMessage: Message<boolean> | PartialMessage
  ) {
    this.#log('info', 'Asking for translation confirmation', {
      id: thread.id,
    })
    const { crowdinManager } = this.client
    const confirmBtn = {
      type: 2,
      style: 1,
      label: 'Yes, retranslate',
      custom_id: `retranslate:${thread.id}`,
    }
    const cancelBtn = {
      type: 2,
      style: 2,
      label: 'No, skip',
      custom_id: `skip:${thread.id}`,
    }
    const languageObjects = crowdinManager.getLanguages({ withEnglish: false })
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
            if (part.added) return `**+${part.value}**`
            if (part.removed) return `~~-${part.value}~~`
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
      contentDiff.replace(/\n/g, '\n>'),
    ].join('\n')

    await message?.author?.send({
      content,
      components: [{ type: 1, components: [confirmBtn, cancelBtn] }],
    })
  }

  bindEvents() {
    this.#log('info', 'Binding events onto the manager instance')
    const flagsManager = this.client.flagsManager

    this.client.faqManager.on(
      'ThreadCreated',
      async (thread: ResolvedThread) => {
        if ((await flagsManager.getFeatureFlag('auto_indexing')) === true) {
          await this.translateAndIndexThreadInAllLanguages(thread)
        } else {
          this.#log('info', 'Auto-indexing is disabled; aborting.', {
            threadId: thread.id,
          })
        }
      }
    )

    this.client.faqManager.on('ThreadDeleted', async (threadId: string) => {
      if ((await flagsManager.getFeatureFlag('auto_indexing')) === true) {
        await this.unindexThreadInAllLanguages(threadId)
      } else {
        this.#log('info', 'Auto-indexing is disabled; aborting.', { threadId })
      }
    })

    this.client.faqManager.on(
      'ThreadNameUpdated',
      async (thread: ResolvedThread) => {
        if ((await flagsManager.getFeatureFlag('auto_indexing')) === true) {
          await this.translateAndIndexThreadInAllLanguages(thread)
        } else {
          this.#log('info', 'Auto-indexing is disabled; aborting.', {
            threadId: thread.id,
          })
        }
      }
    )

    this.client.faqManager.on(
      'ThreadContentUpdated',
      async (thread, message, oldMessage) => {
        if ((await flagsManager.getFeatureFlag('auto_indexing')) === true) {
          if (
            (await flagsManager.getFeatureFlag('auto_translation_confirm')) ===
            true
          ) {
            await this.confirmRetranslation(thread, message, oldMessage)
          } else {
            await this.translateAndIndexThreadInAllLanguages(thread)
          }
        } else {
          this.#log('info', 'Auto-indexing is disabled; aborting.', {
            thread: thread.id,
          })
        }
      }
    )
  }
}

export const initIndexManager = (client: Client) => {
  const indexManager = new IndexManager(client)
  indexManager.bindEvents()
  return indexManager
}
