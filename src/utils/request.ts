import type { LogManager } from '../managers/LogManager'
import { withRetry } from './withRetry'

export async function request(
  logger: LogManager,
  url: string,
  options?: RequestInit,
  handler: 'json' | 'buffer' = 'json'
) {
  const response = await withRetry(
    attempt => {
      logger.log('info', 'Executing HTTP query', { attempt, options, url })
      return fetch(url, options)
    },
    { logger }
  )

  const data =
    handler === 'json'
      ? await response.json()
      : handler === 'buffer'
        ? Buffer.from(await response.arrayBuffer())
        : await response.text()

  if (!response.ok) {
    logger.log('error', 'HTTP query failed', { data, status: response.status })
    throw new Error(`HTTP query failed (${response.status}): ${JSON.stringify(data)}`)
  }

  return data
}
