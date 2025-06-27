import { describe, it, expect } from 'vitest'

describe('shouldIgnoreInteraction', () => {
  it('ignores interaction with no guildId', async () => {
    const { shouldIgnoreInteraction } = await import(
      './shouldIgnoreInteraction'
    )
    const result = shouldIgnoreInteraction({ guildId: null })
    expect(result).toBeUndefined()
  })

  it('ignores in production if guildId is the test server', async () => {
    const { shouldIgnoreInteraction } = await import(
      './shouldIgnoreInteraction'
    )
    const { TEST_SERVER_ID } = await import('../constants/discord')

    const result = shouldIgnoreInteraction(
      { guildId: TEST_SERVER_ID ?? '' },
      'production'
    )
    expect(result).toBe(true)
  })

  it('does not ignore in production if guildId is NOT the test server', async () => {
    const { shouldIgnoreInteraction } = await import(
      './shouldIgnoreInteraction'
    )

    const result = shouldIgnoreInteraction(
      { guildId: 'some-other-server' },
      'production'
    )
    expect(result).toBe(false)
  })

  it('ignores in dev if guildId is NOT the test server', async () => {
    const { shouldIgnoreInteraction } = await import(
      './shouldIgnoreInteraction'
    )

    const result = shouldIgnoreInteraction(
      { guildId: 'some-other-server' },
      'development'
    )
    expect(result).toBe(true)
  })

  it('does not ignore in dev if guildId IS the test server', async () => {
    const { shouldIgnoreInteraction } = await import(
      './shouldIgnoreInteraction'
    )
    const { TEST_SERVER_ID } = await import('../constants/discord')

    const result = shouldIgnoreInteraction(
      { guildId: TEST_SERVER_ID ?? '' },
      'development'
    )
    expect(result).toBe(false)
  })

  it('does not ignore when neither DEV nor PROD flags are set', async () => {
    const { shouldIgnoreInteraction } = await import(
      './shouldIgnoreInteraction'
    )

    const result = shouldIgnoreInteraction({ guildId: 'any-server' })
    expect(result).toBe(false)
  })
})
