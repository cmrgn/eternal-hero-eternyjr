import type { AnyThreadChannel, ChatInputCommandInteraction } from 'discord.js'
import Fuse, { type FuseResult } from 'fuse.js'
import { sendAlert } from './sendAlert'

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

const ALT_KEYWORDS = [
  { from: 'error token', to: 'token' },
  { from: 'relic XP', to: 'relic not gaining XP' },
  { from: 'floating', to: 'extra weapon mastery point' },
  { from: 'caps stats', to: 'caps to some stats' },
]

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

export async function alertEmptySearch(
  interaction: ChatInputCommandInteraction,
  keyword: string
) {
  return sendAlert(
    interaction,
    `A search for _“${keyword}”_ yielded no results. If it’s unexpected, we may want to improve it with assigning that keyword (or something similar) to a specific search term.`
  )
}
