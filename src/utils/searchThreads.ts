import type { AnyThreadChannel } from 'discord.js'
import Fuse, { type FuseResult } from 'fuse.js'

type SearchResult = {
  keyword: string
  results: FuseResult<AnyThreadChannel>[]
}

const BASE_SEARCH_OPTIONS = {
  includeScore: true,
  ignoreDiacritics: true,
  minMatchCharLength: 3,
  threshold: 0.3,
  ignoreLocation: true,
}

const ALT_KEYWORDS = [{ from: 'blank pages', to: 'Tomes of Knowledge' }]

const ALT_SEARCH = new Fuse(ALT_KEYWORDS, {
  ...BASE_SEARCH_OPTIONS,
  keys: ['from'],
})

const isRelevant = <T>(result: FuseResult<T>) =>
  result.score && result.score <= 0.5

export function searchThreads(
  threads: AnyThreadChannel[],
  keyword: string
): SearchResult {
  const fuse = new Fuse(threads, { ...BASE_SEARCH_OPTIONS, keys: ['name'] })

  // Base search, yielding results
  const results = fuse.search(keyword).filter(isRelevant)
  if (results.length) return { keyword, results }

  // Base search without results, no alternative search available
  const altKeywords = ALT_SEARCH.search(keyword).filter(isRelevant)
  const altKeyword = altKeywords[0]
  if (!altKeyword) return { keyword, results: [] }

  // Alternative search available, but no results either
  const altResults = fuse.search(altKeyword.item.to).filter(isRelevant)
  if (!altResults.length) return { keyword: altKeyword.item.to, results: [] }

  // Alternative search yielded results
  return { keyword: altKeyword.item.to, results: altResults }
}
