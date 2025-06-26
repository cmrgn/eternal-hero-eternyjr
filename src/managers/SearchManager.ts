import type { Client } from 'discord.js'
import type { SearchRecordsResponse } from '@pinecone-database/pinecone'
import type { AnyThreadChannel } from 'discord.js'
import Fuse, { type FuseResult } from 'fuse.js'

import { PINECONE_API_KEY } from '../constants/config'
import type { CrowdinCode } from '../constants/i18n'
import { logger } from '../utils/logger'

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

type Hit = SearchRecordsResponse['result']['hits'][number]
type SearchResultVector = Hit & { fields: PineconeMetadata }
type SearchResultFuse = FuseResult<AnyThreadChannel>
type SearchResult = SearchResultVector
export type SearchType = 'VECTOR' | 'FUZZY'

const FUZZY_SEARCH_OPTIONS = {
  includeScore: true,
  ignoreDiacritics: true,
  minMatchCharLength: 3,
  threshold: 0.3,
  ignoreLocation: true,
}

export class SearchManager {
  client: Client
  altFuse: Fuse<{ from: string; to: string }>
  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('LeaderboardManager', this.#severityThreshold)

  constructor(client: Client) {
    this.#log('info', 'Instantiating client')

    this.client = client
    this.altFuse = new Fuse(
      [
        { from: 'error token', to: 'invalid token error' },
        { from: 'floating', to: 'extra weapon mastery point' },
        { from: 'additional skill points', to: 'extra weapon mastery point' },
        { from: 'guide', to: 'getting started as a beginner' },
        { from: 'augmentation', to: 'reroll rank power' },
        { from: 'afk farm', to: 'AFK/idle' },
        { from: 'newbie', to: 'beginner' },
      ],
      { ...FUZZY_SEARCH_OPTIONS, keys: ['from'] }
    )
  }

  // Perform a search: either an asynchronous vector search on the FAQ content
  // or a synchronous fuzzy search on the FAQ titles. Note: for vector searches,
  // the limit is not guaranteed to be reached even when there would be enough
  // results because low scoring results get filtered out.
  async search(
    query: string,
    type: SearchType,
    namespaceName: PineconeNamespace,
    limit = 1
  ): Promise<{ query: string; results: SearchResult[] }> {
    this.#log('info', 'Performing search', {
      query,
      type,
      namespaceName,
      limit,
    })

    if (!PINECONE_API_KEY && type === 'VECTOR') {
      type = 'FUZZY'
      this.#log(
        'warn',
        'Missing environment variable PINECONE_API_KEY; falling back to Fuzzy search.'
      )
    }

    if (type === 'VECTOR') {
      try {
        const hits = await this.searchVector(query, namespaceName, limit)
        const results = hits
          .filter(this.isHitRelevant)
          .map(this.normalizeResult)

        return { query, results }
      } catch (error) {
        this.#log(
          'warn',
          'Vector search failed; falling back to fuzzy search.',
          error
        )

        return this.search(query, 'FUZZY', namespaceName, limit)
      }
    }

    if (type === 'FUZZY') {
      const hits = this.searchFuzzy(query)
      const results = hits.results
        .filter(this.isHitRelevant)
        .slice(0, limit)
        .map(this.normalizeResult)

      return { query: hits.keyword, results }
    }

    return { query, results: [] }
  }

  // Perform a vector search with Pinecone, with immediate reranking for better
  // results.
  async searchVector(
    query: string,
    namespaceName: PineconeNamespace,
    limit = 1
  ) {
    const response = await this.client.indexationManager
      .resolveNamespace(namespaceName)
      .searchRecords({
        query: { topK: limit, inputs: { text: query } },
        rerank: {
          model: 'bge-reranker-v2-m3',
          topN: limit,
          rankFields: ['chunk_text'],
        },
      })

    return response.result.hits as SearchResultVector[]
  }

  // Perform a fuzzy search with Fuse.js. If it yields no result, it will
  // perform a search within the alt fuse to find a manually indexed keyword. If
  // it finds one, it will redo the original search with the new keyword. This
  // helps padding some obvious gaps in search results.
  searchFuzzy(keyword: string): {
    keyword: string
    results: SearchResultFuse[]
  } {
    const primaryFuse = new Fuse(this.client.faqManager.threads, {
      ...FUZZY_SEARCH_OPTIONS,
      keys: ['name'],
    })

    // Base search, yielding results
    const results = primaryFuse.search(keyword).filter(this.isHitRelevant)
    if (results.length) return { keyword, results }

    // Base search without results, no alternative search available
    const altKeywords = this.altFuse.search(keyword).filter(this.isHitRelevant)
    const altKeyword = altKeywords[0]
    if (!altKeyword) return { keyword, results: [] }

    // Alternative search available, but no results either
    const altResults = primaryFuse
      .search(altKeyword.item.to)
      .filter(this.isHitRelevant)
    if (!altResults.length) return { keyword: altKeyword.item.to, results: [] }

    // Alternative search yielded results
    return { keyword: altKeyword.item.to, results: altResults }
  }

  // Figure out whether the given result is a relevant one. Note: this needs to
  // happen **before** result normalization since it uses the raw score from
  // Fuse.js, and not the normalized one.
  isHitRelevant(hit: SearchResultVector | FuseResult<unknown>): boolean {
    if ('_score' in hit) return hit._score > 0.3
    if ('score' in hit && hit.score) return hit.score <= 0.65
    return false
  }

  // Normalize fuzzy search results into the same shape as the vector search
  // results to make it more convenient to use the search. Note: the content of
  // each FAQ entry and its tags will be missing, since the fuzzy search only
  // operates on entry names.
  normalizeResult(result: SearchResultVector | SearchResultFuse): SearchResult {
    if ('refIndex' in result) {
      return {
        _id: `entry#${result.item.id}`,
        _score: 1 - (result.score ?? 1),
        fields: {
          entry_question: result.item.name,
          entry_answer: '',
          entry_tags: [],
          entry_indexed_at: new Date().toISOString(),
          entry_url: result.item.url,
        },
      }
    }

    return result
  }
}

export const initSearchManager = (client: Client) => {
  const searchManager = new SearchManager(client)
  return searchManager
}
