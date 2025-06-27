import { describe, it, expect, vi, beforeEach } from 'vitest'
import { type InteractionLike, sendAlert } from './sendAlert'

vi.mock('discord.js', async () => {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const actual = await vi.importActual<any>('discord.js')
  return {
    ...actual,
    channelMention: (id: string) => `<#${id}>`,
    userMention: (id: string) => `<@${id}>`,
  }
})

vi.mock('../constants/discord', () => ({
  ALERT_CHANNEL_ID: 'alert-channel-id',
  TEST_SERVER_ID: 'test-server-id',
}))

vi.mock('./stripIndent', () => ({
  stripIndent: vi.fn(str => str.trim()),
}))

describe('sendAlert', () => {
  const mockSend = vi.fn()
  const mockFetch = vi.fn()

  const mockClient = {
    channels: {
      fetch: mockFetch,
    },
  }

  const baseInteraction = {
    client: mockClient,
    guildId: 'some-server-id',
    guild: { name: 'Some Server' },
    channelId: 'channel-id',
    user: { id: 'user-id' },
  } as unknown as InteractionLike

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends a formatted alert message', async () => {
    mockFetch.mockResolvedValue({ isSendable: () => true, send: mockSend })

    await sendAlert(baseInteraction, 'Test alert')

    expect(mockFetch).toHaveBeenCalledWith('alert-channel-id')
    expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('Test alert'))
    expect(mockSend).toHaveBeenCalledWith(
      expect.stringContaining('Some Server')
    )
    expect(mockSend).toHaveBeenCalledWith(
      expect.stringContaining('<#channel-id>')
    )
    expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('<@user-id>'))
  })

  it('does not send if channel is not sendable', async () => {
    mockFetch.mockResolvedValue({ isSendable: () => false })

    await sendAlert(baseInteraction, 'Test alert')

    expect(mockSend).not.toHaveBeenCalled()
  })

  it('does not send if in test server', async () => {
    const testInteraction = { ...baseInteraction, guildId: 'test-server-id' }
    mockFetch.mockResolvedValue({ isSendable: () => true, send: mockSend })

    await sendAlert(testInteraction, 'Test alert')

    expect(mockSend).not.toHaveBeenCalled()
  })

  it('handles missing user gracefully', async () => {
    mockFetch.mockResolvedValue({ isSendable: () => true, send: mockSend })
    const interactionWithoutUser = {
      ...baseInteraction,
      user: null,
      userId: 'fallback-id',
    }

    await sendAlert(interactionWithoutUser, 'Test alert')

    expect(mockSend).toHaveBeenCalledWith(
      expect.stringContaining('<@fallback-id>')
    )
  })

  it('logs error if send throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFetch.mockResolvedValue({
      isSendable: () => true,
      send: vi.fn().mockRejectedValue(new Error('send error')),
    })

    await sendAlert(baseInteraction, 'Test alert')

    expect(consoleError).toHaveBeenCalledWith(expect.any(Error))

    consoleError.mockRestore()
  })
})
