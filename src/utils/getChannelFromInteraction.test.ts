import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getChannelFromInteraction } from './getChannelFromInteraction'
import type { InteractionLike } from '../events/messageCreate'

describe('getChannelFromInteraction', () => {
  const mockFetch = vi.fn()
  const mockGuildChannelCache = new Map()

  const mockInteraction = {
    client: {
      channels: {
        fetch: mockFetch,
      },
    },
    guild: {
      channels: {
        cache: {
          find: (predicate: (c: { id: string }) => boolean) => {
            return (
              Array.from(mockGuildChannelCache.values()).find(predicate) ??
              undefined
            )
          },
        },
      },
    },
    channel: { id: 'channel-id' },
  } as unknown as InteractionLike

  beforeEach(() => {
    vi.clearAllMocks()
    mockGuildChannelCache.clear()
  })

  it('returns channel from guild cache if present', async () => {
    const cachedChannel = { id: 'channel-id', name: 'cached-channel' }
    mockGuildChannelCache.set('channel-id', cachedChannel)

    const result = await getChannelFromInteraction(mockInteraction)

    expect(result).toBe(cachedChannel)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fetches channel if not in guild cache', async () => {
    const fetchedChannel = { id: 'channel-id', name: 'fetched-channel' }
    mockFetch.mockResolvedValue(fetchedChannel)

    const result = await getChannelFromInteraction(mockInteraction)

    expect(result).toBe(fetchedChannel)
    expect(mockFetch).toHaveBeenCalledWith('channel-id')
  })

  it('returns undefined if neither guild nor fetch has the channel', async () => {
    mockFetch.mockResolvedValue(undefined)

    const result = await getChannelFromInteraction(mockInteraction)

    expect(result).toBeUndefined()
    expect(mockFetch).toHaveBeenCalledWith('channel-id')
  })
})
