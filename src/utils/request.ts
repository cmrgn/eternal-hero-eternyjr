import type { LogFunction } from './logger'
import { withRetry } from './withRetry'

export async function request(
  logFn: LogFunction,
  url: string,
  options?: RequestInit,
  handler: 'json' | 'buffer' = 'json'
) {
  const response = await withRetry(
    attempt => {
      logFn('info', 'Executing HTTP query', { attempt, options, url })
      return fetch(url, options)
    },
    { logFn }
  )

  const data =
    handler === 'json'
      ? await response.json()
      : handler === 'buffer'
        ? Buffer.from(await response.arrayBuffer())
        : await response.text()

  if (!response.ok) {
    logFn('error', 'HTTP query failed', { data, status: response.status })
    throw new Error(`HTTP query failed (${response.status}): ${JSON.stringify(data)}`)
  }

  return data
}
