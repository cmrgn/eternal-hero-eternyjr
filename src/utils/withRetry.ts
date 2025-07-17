import type { LogManager } from '../managers/LogManager'

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: { logger: LogManager; retries?: number; baseDelay?: number }
): Promise<T> {
  let lastError: unknown
  const { logger, retries = 2, baseDelay = 500 } = options

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt)
    } catch (err) {
      lastError = err

      logger.log('error', `Promise rejected, failed attempt #${attempt + 1} (index: ${attempt})`, {
        err,
      })

      if (attempt < retries) {
        await new Promise(r => setTimeout(r, baseDelay * 2 ** attempt))
      }
    }
  }

  throw lastError
}
