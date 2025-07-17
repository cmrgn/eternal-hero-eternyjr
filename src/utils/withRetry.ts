import type { LogFunction } from './logger'

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: { logFn: LogFunction; retries?: number; baseDelay?: number }
): Promise<T> {
  let lastError: unknown
  const { logFn, retries = 2, baseDelay = 500 } = options

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt)
    } catch (err) {
      lastError = err

      logFn('error', `Promise rejected, failed attempt #${attempt + 1} (index: ${attempt})`, {
        err,
      })

      if (attempt < retries) {
        await new Promise(r => setTimeout(r, baseDelay * 2 ** attempt))
      }
    }
  }

  throw lastError
}
