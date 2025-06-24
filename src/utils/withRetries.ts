/**
 * Retry a function with exponential backoff.
 *
 * @param fn The async function to retry
 * @param options Options object containing retries, backoffMs, and label
 * @param options.retries Number of attempts before giving up (default: 3)
 * @param options.backoffMs Base delay in ms between attempts (default: 1000)
 * @param options.label Optional label for logging context
 * @returns The resolved value or throws an error on failure
 */
export async function withRetries<T>(
  fn: () => Promise<T>,
  options?: { retries?: number; backoffMs?: number; label?: string }
): Promise<T> {
  const { retries = 3, backoffMs = 1000, label } = options ?? {}

  let attempt = 0
  while (attempt < retries) {
    try {
      return await fn()
    } catch (error) {
      attempt++
      console.warn(
        `[Retry] Attempt ${attempt}${label ? ` (${label})` : ''}`,
        error
      )
      if (attempt >= retries) {
        console.error(
          `[Retry] Failed after ${retries} attempts${label ? ` (${label})` : ''}`,
          error
        )
        throw error
      }
      await new Promise(res => setTimeout(res, backoffMs * 2 ** attempt))
    }
  }

  throw new Error(
    `Unexpected exit without completion${label ? ` (${label})` : ''}`
  )
}
