import { describe, it, expect, vi } from 'vitest'
import { withRetries } from './withRetries'

describe('withRetries', () => {
  it('resolves on first try if function succeeds', async () => {
    const fn = vi.fn().mockResolvedValue('success')

    const result = await withRetries(fn)

    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries until success', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockResolvedValue('success')

    const result = await withRetries(fn, { retries: 3, backoffMs: 10 })

    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('fails after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))

    await expect(
      withRetries(fn, { retries: 3, backoffMs: 10 })
    ).rejects.toThrow('fail')

    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('applies exponential backoff between retries', async () => {
    const sleep = vi.spyOn(global, 'setTimeout')

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success')

    const result = await withRetries(fn, { retries: 3, backoffMs: 10 })

    expect(result).toBe('success')
    expect(sleep).toHaveBeenCalledWith(expect.any(Function), 20) // attempt 1 backoff
    expect(sleep).toHaveBeenCalledWith(expect.any(Function), 40) // attempt 2 backoff

    sleep.mockRestore()
  })

  it('includes label in log output', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const fn = vi.fn().mockRejectedValue(new Error('fail'))

    await expect(
      withRetries(fn, { retries: 2, backoffMs: 10, label: 'TestLabel' })
    ).rejects.toThrow('fail')

    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('[Retry] Attempt 1 (TestLabel)'),
      expect.any(Error)
    )
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('[Retry] Failed after 2 attempts (TestLabel)'),
      expect.any(Error)
    )

    consoleWarn.mockRestore()
    consoleError.mockRestore()
  })
})
